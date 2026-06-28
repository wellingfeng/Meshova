/**
 * Curve frames + gnarl — the spline foundation for the P7 vegetation module.
 *
 * SpeedTree builds every branch as a spline (skeleton) with a moving coordinate
 * frame (tangent / normal / binormal). Sub-branches are seeded onto the parent
 * spline at a parameter `t`, oriented by that frame. `gnarlCurve` adds the
 * deterministic noise wobble that keeps branches from looking laser-straight.
 *
 * Determinism: all randomness flows through the seeded noise source; no
 * Math.random / Date.now. Same seed -> same curve.
 */
import type { Vec3 } from "../math/vec3.js";
import {
  vec3, add, sub, scale, normalize, length, dot, cross, makeBasis,
} from "../math/vec3.js";
import type { Curve } from "../geometry/curve.js";
import { makeNoise, fbm3 } from "../random/noise.js";

/** A moving coordinate frame sampled at a point along a curve. */
export interface CurveFrame {
  /** World-space position on the curve. */
  position: Vec3;
  /** Unit tangent (direction of travel along the curve). */
  tangent: Vec3;
  /** Unit normal (one of two axes perpendicular to the tangent). */
  normal: Vec3;
  /** Unit binormal (tangent x normal). */
  binormal: Vec3;
}

/**
 * Sample position + orthonormal frame at parameter `t` in [0,1] along a curve.
 * `t` is parameterized by point index (uniform in samples, not arc length) —
 * cheap, stable, and good enough for branch seeding.
 */
export function curveFrameAt(curve: Curve, t: number): CurveFrame {
  const pts = curve.points;
  const n = pts.length;
  if (n === 0) {
    return { position: vec3(), tangent: vec3(0, 1, 0), normal: vec3(1, 0, 0), binormal: vec3(0, 0, 1) };
  }
  if (n === 1) {
    const b = makeBasis(vec3(0, 1, 0));
    return { position: { ...pts[0]! }, tangent: b.z, normal: b.x, binormal: b.y };
  }
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = clamped * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const k = f - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const position = add(a, scale(sub(b, a), k));
  // Central-difference tangent for smoothness.
  const prev = pts[Math.max(0, i - 1)]!;
  const next = pts[Math.min(n - 1, i + 2)]!;
  let tangent = sub(next, prev);
  if (length(tangent) < 1e-8) tangent = sub(b, a);
  tangent = length(tangent) < 1e-8 ? vec3(0, 1, 0) : normalize(tangent);
  const basis = makeBasis(tangent); // { x: normal, y: binormal, z: tangent }
  return { position, tangent, normal: basis.x, binormal: basis.y };
}

/** Unit tangent at `t` in [0,1] (thin wrapper over curveFrameAt). */
export function curveTangentAt(curve: Curve, t: number): Vec3 {
  return curveFrameAt(curve, t).tangent;
}

export interface GnarlOptions {
  seed?: number;
  /** Lateral displacement amount, in world units. */
  amount?: number;
  /** Noise spatial frequency; higher = tighter wobble. */
  frequency?: number;
  /** fbm octaves. */
  octaves?: number;
  /**
   * Taper the wobble so the base stays put (0 at root, 1 at tip). Useful for
   * trunks anchored to the ground. Default true.
   */
  rootAnchored?: boolean;
}

/**
 * Add a deterministic noise wobble to a curve, displacing each point in the
 * plane perpendicular to its tangent. This is SpeedTree's "gnarl": the gentle
 * meander that makes a trunk or branch read as organic rather than a pipe.
 */
export function gnarlCurve(curve: Curve, opts: GnarlOptions = {}): Curve {
  const amount = opts.amount ?? 0.1;
  const frequency = opts.frequency ?? 1.2;
  const octaves = opts.octaves ?? 3;
  const rootAnchored = opts.rootAnchored ?? true;
  const noise = makeNoise(opts.seed ?? 1);
  const pts = curve.points;
  const n = pts.length;
  if (n < 2 || amount === 0) return { points: pts.map((p) => ({ ...p })), closed: curve.closed };

  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const frame = curveFrameAt(curve, t);
    // Two independent noise channels -> displacement in the normal/binormal plane.
    const nx = fbm3(noise, frame.position.x * frequency, frame.position.y * frequency, frame.position.z * frequency + 11.3, { octaves });
    const ny = fbm3(noise, frame.position.x * frequency + 5.7, frame.position.y * frequency, frame.position.z * frequency, { octaves });
    const taper = rootAnchored ? t : 1;
    const disp = add(scale(frame.normal, nx * amount * taper), scale(frame.binormal, ny * amount * taper));
    out.push(add(pts[i]!, disp));
  }
  return { points: out, closed: curve.closed };
}

/**
 * Build a branch centerline from a start point and direction, integrating
 * phototropism (bend toward +Y / light) and gravity (bend toward -Y) per
 * segment, plus a gnarl wobble. This is the core "grow a branch" integrator
 * SpeedTree uses; returns a Curve ready to sweep.
 */
export interface GrowCurveOptions {
  segments?: number;
  /** Bend toward +Y per unit length (0..1). */
  phototropism?: number;
  /** Bend toward -Y per unit length (0..1). */
  gravity?: number;
  /** Lateral gnarl amount along the branch. */
  gnarl?: number;
  /** Noise frequency for gnarl. */
  gnarlFrequency?: number;
  seed?: number;
}

export function growCurve(
  start: Vec3,
  direction: Vec3,
  lengthUnits: number,
  opts: GrowCurveOptions = {},
): Curve {
  const segments = Math.max(2, Math.floor(opts.segments ?? 8));
  const photo = opts.phototropism ?? 0;
  const grav = opts.gravity ?? 0;
  const gnarl = opts.gnarl ?? 0;
  const freq = opts.gnarlFrequency ?? 1.5;
  const noise = makeNoise(opts.seed ?? 7);
  const segLen = lengthUnits / segments;
  const UP = vec3(0, 1, 0);
  const DOWN = vec3(0, -1, 0);

  let dir = normalize(direction);
  let pt = { ...start };
  const pts: Vec3[] = [{ ...pt }];
  for (let s = 0; s < segments; s++) {
    // Bend the direction toward up (light) and down (gravity).
    if (photo > 0) dir = normalize(add(dir, scale(sub(UP, scale(dir, dot(dir, UP))), photo / segments)));
    if (grav > 0) dir = normalize(add(dir, scale(sub(DOWN, scale(dir, dot(dir, DOWN))), grav / segments)));
    // Lateral gnarl perpendicular to current direction.
    let step = scale(dir, segLen);
    if (gnarl > 0) {
      const basis = makeBasis(dir);
      const wob = fbm3(noise, pt.x * freq, pt.y * freq, pt.z * freq, { octaves: 2 });
      const wob2 = fbm3(noise, pt.x * freq + 9.1, pt.y * freq, pt.z * freq, { octaves: 2 });
      step = add(step, add(scale(basis.x, wob * gnarl * segLen), scale(basis.y, wob2 * gnarl * segLen)));
    }
    pt = add(pt, step);
    pts.push({ ...pt });
  }
  return { points: pts, closed: false };
}

/** Rotate a vector around an arbitrary unit axis (Rodrigues). */
export function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const a = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(a, v), s)), scale(a, dot(a, v) * (1 - c)));
}
