/**
 * Parallel-transport frames — stable orientation frames along a curve.
 *
 * The problem: to sweep a profile (tube, rail, ribbon, bolt row) along a curve
 * you need a local coordinate frame (tangent + two perpendiculars) at every
 * point. The naive `cross(tangent, worldUp)` frame FLIPS when the tangent
 * passes vertical (up becomes parallel to the axis, the cross degenerates) —
 * that's the "twist flip" that makes cables and rails snap 180° mid-bend.
 *
 * Parallel transport fixes this: start with one perpendicular, then rotate it
 * by the minimal rotation that carries each tangent onto the next (the
 * Bishop/rotation-minimizing frame). No global up, no flips, minimal twist.
 *
 * Closed curves get one extra correction: after transporting all the way
 * around, the frame generally doesn't line up with where it started (the
 * curve's holonomy). We measure that residual angle and distribute its
 * negative evenly along the curve so the seam closes smoothly with no visible
 * twist jump.
 *
 * Determinism: pure function of the point list. Same points -> same frames.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";

/** A local frame at a curve sample: unit tangent + two unit perpendiculars. */
export interface TransportFrame {
  /** Sample position on the curve. */
  position: Vec3;
  /** Unit tangent (curve direction). */
  tangent: Vec3;
  /** First perpendicular (the transported reference; "up"/normal). */
  normal: Vec3;
  /** Second perpendicular = tangent × normal ("right"/binormal). */
  binormal: Vec3;
}

export interface FrameOptions {
  /**
   * Treat the point list as a closed loop: tangents wrap, and the holonomy
   * twist residual is distributed so the seam matches. Default false.
   */
  closed?: boolean;
  /**
   * Seed perpendicular for the first frame. If omitted, an arbitrary stable
   * perpendicular to the first tangent is chosen. Useful to align the profile
   * (e.g. keep a rail's web vertical) — it's projected onto the tangent plane.
   */
  initialNormal?: Vec3;
}

/** A stable arbitrary perpendicular to t (avoids the degenerate axis). */
export function pickPerpendicular(t: Vec3): Vec3 {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  const other = ax < ay && ax < az ? vec3(1, 0, 0) : ay < az ? vec3(0, 1, 0) : vec3(0, 0, 1);
  return normalize(cross(t, other));
}

/** Rodrigues rotation of v around a unit axis by angle radians. */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(
    add(scale(v, c), scale(cross(axis, v), s)),
    scale(axis, dot(axis, v) * (1 - c)),
  );
}

/** Per-point unit tangents via neighbour differences (wraps if closed). */
export function curveTangents(points: ReadonlyArray<Vec3>, closed = false): Vec3[] {
  const n = points.length;
  return points.map((_, i) => {
    let prev: Vec3, next: Vec3;
    if (closed) {
      prev = points[(i - 1 + n) % n]!;
      next = points[(i + 1) % n]!;
    } else {
      prev = points[Math.max(0, i - 1)]!;
      next = points[Math.min(n - 1, i + 1)]!;
    }
    const d = sub(next, prev);
    const l = length(d);
    // Fallback for coincident neighbours: use forward or backward difference.
    if (l < 1e-9) {
      const alt = sub(points[Math.min(n - 1, i + 1)]!, points[Math.max(0, i - 1)]!);
      return length(alt) < 1e-9 ? vec3(0, 0, 1) : normalize(alt);
    }
    return normalize(d);
  });
}

/**
 * Compute rotation-minimizing (parallel-transport) frames along a point list.
 * The returned frames carry no twist flips; for closed loops the seam twist is
 * evenly cancelled so the profile lines up end-to-end.
 */
export function parallelTransportFrames(
  points: ReadonlyArray<Vec3>,
  opts: FrameOptions = {},
): TransportFrame[] {
  const n = points.length;
  if (n === 0) return [];
  const closed = opts.closed ?? false;
  const tangents = curveTangents(points, closed);

  if (n === 1) {
    const t = tangents[0]!;
    const nrm = seedNormal(t, opts.initialNormal);
    return [{ position: points[0]!, tangent: t, normal: nrm, binormal: normalize(cross(t, nrm)) }];
  }

  // Seed the first normal, projected onto the plane perpendicular to t0.
  let normalRef = seedNormal(tangents[0]!, opts.initialNormal);

  const frames: TransportFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    // Re-project the transported ref onto the current tangent plane.
    normalRef = normalize(sub(normalRef, scale(t, dot(normalRef, t))));
    if (length(normalRef) < 1e-5) normalRef = pickPerpendicular(t);
    const binormal = normalize(cross(t, normalRef));
    frames.push({ position: points[i]!, tangent: t, normal: normalRef, binormal });

    // Rotate the ref by the minimal rotation carrying t -> tNext.
    const hasNext = closed ? true : i < n - 1;
    if (hasNext) {
      const tNext = tangents[closed ? (i + 1) % n : i + 1]!;
      normalRef = transportStep(normalRef, t, tNext);
    }
  }

  if (closed && n > 2) closeSeam(frames, tangents);

  return frames;
}

/** Seed perpendicular: use the (projected) requested normal, else arbitrary. */
function seedNormal(t: Vec3, requested?: Vec3): Vec3 {
  if (requested) {
    const proj = sub(requested, scale(t, dot(requested, t)));
    if (length(proj) > 1e-5) return normalize(proj);
  }
  return pickPerpendicular(t);
}

/** Rotate v by the minimal rotation that carries tangent `t` onto `tNext`. */
function transportStep(v: Vec3, t: Vec3, tNext: Vec3): Vec3 {
  const axis = cross(t, tNext);
  const axisLen = length(axis);
  if (axisLen <= 1e-6) return v; // near-parallel: no rotation
  const cosA = Math.max(-1, Math.min(1, dot(t, tNext)));
  const angle = Math.acos(cosA);
  return rotateAroundAxis(v, scale(axis, 1 / axisLen), angle);
}

/**
 * Distribute the holonomy residual so a closed loop's seam matches. Measures
 * the signed angle between the last frame's transported normal and the first
 * frame's normal (about the shared tangent), then un-twists each frame by a
 * proportional fraction.
 */
function closeSeam(frames: TransportFrame[], tangents: Vec3[]): void {
  const n = frames.length;
  // Transport the final normal one more step back onto t0 to compare with frame0.
  const last = frames[n - 1]!;
  const t0 = tangents[0]!;
  let wrapped = transportStep(last.normal, last.tangent, t0);
  wrapped = normalize(sub(wrapped, scale(t0, dot(wrapped, t0))));
  const n0 = frames[0]!.normal;
  const b0 = frames[0]!.binormal;
  // Signed residual angle in the (n0, b0) plane.
  const cosR = Math.max(-1, Math.min(1, dot(wrapped, n0)));
  const sinR = dot(wrapped, b0);
  const residual = Math.atan2(sinR, cosR);
  if (Math.abs(residual) < 1e-7) return;
  // Un-twist each frame progressively (frame i by -residual * i/n).
  for (let i = 0; i < n; i++) {
    const f = frames[i]!;
    const a = -residual * (i / n);
    const nrm = rotateAroundAxis(f.normal, f.tangent, a);
    frames[i] = { position: f.position, tangent: f.tangent, normal: normalize(nrm), binormal: normalize(cross(f.tangent, nrm)) };
  }
}
