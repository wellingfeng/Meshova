/**
 * Field generators (P11): basic procedural primitives that round out the
 * pattern toolbox — white noise, checker, stripes, dots, polygonal shapes and
 * a star. Mirrors Substance Designer's Shape / Checker / Stripes / Tile-style
 * generators but as pure (u,v)->[0,1] field functions. Self-written from
 * public algorithm knowledge.
 *
 * All return functions (u,v) -> scalar in [0,1], deterministic given seed.
 */
import { makeRng } from "../random/prng.js";
import { clamp, smoothstep, TAU } from "../math/scalar.js";

/**
 * White noise: an independent pseudo-random value per integer cell, hashed
 * from cell coords + seed. Unlike Perlin it has no spatial smoothness, ideal
 * as a randomization seed for grain, dithering and per-tile variation.
 */
export function whiteNoise(
  seed = 0,
  scale = 256,
): (u: number, v: number) => number {
  return (u, v) => {
    const cx = Math.floor(u * scale);
    const cy = Math.floor(v * scale);
    const h = ((cx * 374761393) ^ (cy * 668265263) ^ (seed * 2147483647)) >>> 0;
    return makeRng(h).next();
  };
}

export interface CheckerOptions {
  /** Cells across the width/height. */
  scale?: number;
  /** Soft edge width (0 = hard checker). */
  softness?: number;
}

/** Checkerboard mask in [0,1]. UV sanity check and alternating pattern base. */
export function checker(
  opts: CheckerOptions = {},
): (u: number, v: number) => number {
  const scale = opts.scale ?? 8;
  const soft = opts.softness ?? 0;
  return (u, v) => {
    const cx = Math.floor(u * scale);
    const cy = Math.floor(v * scale);
    const on = (cx + cy) & 1;
    if (soft <= 0) return on ? 1 : 0;
    // soften toward cell centers for anti-aliased edges
    const fx = u * scale - cx;
    const fy = v * scale - cy;
    const e = Math.min(fx, 1 - fx, fy, 1 - fy);
    const edge = smoothstep(0, soft, e);
    return on ? edge : 1 - edge;
  };
}

export interface StripesOptions {
  /** Number of stripe periods across the field. */
  count?: number;
  /** Stripe direction angle in radians (0 = vertical stripes). */
  angle?: number;
  /** Fraction of the period that is "on" (duty cycle), 0..1. */
  duty?: number;
  /** Soft edge width in period fraction. */
  softness?: number;
}

/** Hard/soft stripes (square wave). Good for planks, grates, blinds. */
export function stripes(
  opts: StripesOptions = {},
): (u: number, v: number) => number {
  const count = opts.count ?? 8;
  const angle = opts.angle ?? 0;
  const duty = clamp(opts.duty ?? 0.5, 0, 1);
  const soft = opts.softness ?? 0;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return (u, v) => {
    const p = ((u - 0.5) * dx + (v - 0.5) * dy + 0.5) * count;
    const f = p - Math.floor(p);
    if (soft <= 0) return f < duty ? 1 : 0;
    // rising edge at 0, falling edge at duty
    const rise = smoothstep(0, soft, f);
    const fall = 1 - smoothstep(duty - soft, duty, f);
    return clamp(Math.min(rise, fall) + (f < duty ? 0 : 0), 0, 1);
  };
}

export interface DotsOptions {
  /** Dots across width/height. */
  scale?: number;
  /** Dot radius in cell fraction (0..0.5). */
  radius?: number;
  /** Edge softness. */
  softness?: number;
}

/**
 * Regular dot grid (polka dots). Returns 1 inside dots, 0 outside, soft edge.
 * Base for rivets, perforations, polka patterns.
 */
export function dots(opts: DotsOptions = {}): (u: number, v: number) => number {
  const scale = opts.scale ?? 8;
  const radius = clamp(opts.radius ?? 0.3, 0, 0.5);
  const soft = opts.softness ?? 0.05;
  return (u, v) => {
    const fx = u * scale - Math.floor(u * scale) - 0.5;
    const fy = v * scale - Math.floor(v * scale) - 0.5;
    const d = Math.hypot(fx, fy);
    return 1 - smoothstep(radius - soft, radius + soft, d);
  };
}
export interface ShapeOptions {
  /** Shape kind. */
  type?: "disc" | "square" | "ngon" | "ring";
  /** Center. */
  cx?: number;
  cy?: number;
  /** Size (radius / half-extent), 0..0.5 typical. */
  size?: number;
  /** Edge softness. */
  softness?: number;
  /** Sides for ngon (>=3). */
  sides?: number;
  /** Rotation for ngon (radians). */
  rotation?: number;
  /** Ring thickness fraction (ring type only). */
  thickness?: number;
}

/**
 * Single shape mask centered in the field — SD's "Shape" node. Returns a soft
 * [0,1] mask. The atom for splatter/tile inputs and stencils.
 */
export function shape(opts: ShapeOptions = {}): (u: number, v: number) => number {
  const type = opts.type ?? "disc";
  const cx = opts.cx ?? 0.5;
  const cy = opts.cy ?? 0.5;
  const size = opts.size ?? 0.4;
  const soft = opts.softness ?? 0.02;
  const sides = Math.max(3, Math.floor(opts.sides ?? 6));
  const rot = opts.rotation ?? 0;
  const thick = clamp(opts.thickness ?? 0.15, 0, 1);
  return (u, v) => {
    const dx = u - cx;
    const dy = v - cy;
    if (type === "square") {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      return 1 - smoothstep(size - soft, size + soft, d);
    }
    if (type === "ring") {
      const r = Math.hypot(dx, dy);
      const inner = size * (1 - thick);
      const outer = size;
      const a = smoothstep(inner - soft, inner + soft, r);
      const b = 1 - smoothstep(outer - soft, outer + soft, r);
      return clamp(Math.min(a, b), 0, 1);
    }
    if (type === "ngon") {
      // regular polygon SDF via max of half-plane distances
      const ang = Math.atan2(dy, dx) - rot;
      const r = Math.hypot(dx, dy);
      const seg = TAU / sides;
      // distance to nearest polygon edge along the radial slice
      const a = ((ang % seg) + seg) % seg - seg / 2;
      const d = (r * Math.cos(a)) / Math.cos(seg / 2);
      return 1 - smoothstep(size - soft, size + soft, d);
    }
    // disc
    const r = Math.hypot(dx, dy);
    return 1 - smoothstep(size - soft, size + soft, r);
  };
}

export interface StarOptions {
  cx?: number;
  cy?: number;
  /** Number of points. */
  points?: number;
  /** Outer radius. */
  outer?: number;
  /** Inner radius fraction of outer (0..1). */
  innerRatio?: number;
  rotation?: number;
  softness?: number;
}

/** Star mask. Returns soft [0,1]. Decorative stencil / sprite base. */
export function star(opts: StarOptions = {}): (u: number, v: number) => number {
  const cx = opts.cx ?? 0.5;
  const cy = opts.cy ?? 0.5;
  const points = Math.max(3, Math.floor(opts.points ?? 5));
  const outer = opts.outer ?? 0.4;
  const inner = outer * clamp(opts.innerRatio ?? 0.5, 0, 1);
  const rot = opts.rotation ?? 0;
  const soft = opts.softness ?? 0.01;
  return (u, v) => {
    const dx = u - cx;
    const dy = v - cy;
    const r = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) - rot;
    const seg = TAU / points;
    // local angle within a point, folded to [0, seg/2]
    let a = ((ang % seg) + seg) % seg;
    if (a > seg / 2) a = seg - a;
    // radius of the star boundary at this angle (linear tip->valley)
    const t = a / (seg / 2);
    const boundary = outer + (inner - outer) * t;
    return 1 - smoothstep(boundary - soft, boundary + soft, r);
  };
}
export interface GradientLinearOptions {
  /** Direction angle (radians). 0 = left->right. */
  angle?: number;
  /** Repeat count (>1 = sawtooth tiling). */
  repeat?: number;
}

/** Linear gradient sweep, optionally repeating — SD "Gradient Linear". */
export function gradientLinear(
  opts: GradientLinearOptions = {},
): (u: number, v: number) => number {
  const angle = opts.angle ?? 0;
  const repeat = Math.max(1, opts.repeat ?? 1);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return (u, v) => {
    const t = ((u - 0.5) * dx + (v - 0.5) * dy + 0.5) * repeat;
    if (repeat === 1) return clamp(t, 0, 1);
    return t - Math.floor(t); // sawtooth tiling
  };
}

/** Concentric ring gradient from a center (SD "Gradient Radial"). */
export function gradientRadial(
  cx = 0.5,
  cy = 0.5,
  radius = 0.5,
): (u: number, v: number) => number {
  return (u, v) => 1 - clamp(Math.hypot(u - cx, v - cy) / radius, 0, 1);
}

/** Angular/axial sweep gradient around a center (SD "Gradient Axial"). */
export function gradientAngular(
  cx = 0.5,
  cy = 0.5,
  rotation = 0,
): (u: number, v: number) => number {
  return (u, v) => {
    const a = Math.atan2(v - cy, u - cx) - rotation;
    return ((a / TAU) % 1 + 1) % 1;
  };
}
