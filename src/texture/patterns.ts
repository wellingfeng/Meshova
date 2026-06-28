/**
 * Procedural texture pattern functions. All deterministic given a seed.
 *
 * These map a (u,v) coordinate to a scalar in [0,1] (unless noted). They are
 * the material DSL's building blocks: noise/fbm for organic variation,
 * voronoi for cells/cracks, gradient/ramp for color mapping, blend for
 * masked layering. Self-written from public algorithm knowledge.
 */
import { makeNoise, fbm2, type Noise, type FbmOptions } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { clamp, smoothstep } from "../math/scalar.js";

/** Perlin noise remapped from [-1,1] to [0,1]. */
export function noisePattern(
  seed: number,
  scale = 4,
): (u: number, v: number) => number {
  const n = makeNoise(seed);
  return (u, v) => n.noise2(u * scale, v * scale) * 0.5 + 0.5;
}

/** Fractal Brownian motion remapped to [0,1]. */
export function fbmPattern(
  seed: number,
  scale = 4,
  opts: FbmOptions = {},
): (u: number, v: number) => number {
  const n = makeNoise(seed);
  return (u, v) => fbm2(n, u * scale, v * scale, opts) * 0.5 + 0.5;
}

export interface VoronoiOptions {
  scale?: number;
  seed?: number;
  /** "f1" = distance to nearest cell (cells), "f2-f1" = crack/edge mask. */
  metric?: "f1" | "f2-f1" | "cellValue";
  /** How wobbly each cell point is inside its grid square, 0..1. */
  jitter?: number;
}

/**
 * Voronoi / Worley noise. Jittered grid points; per pixel find nearest (F1)
 * and second nearest (F2). Returns [0,1].
 *  - f1: smooth blobby distance field (good for scales, pebbles)
 *  - f2-f1: thin ridges between cells (good for cracks, grout lines)
 *  - cellValue: flat random value per cell (good for tiles/patches)
 */
export function voronoi(
  opts: VoronoiOptions = {},
): (u: number, v: number) => number {
  const scale = opts.scale ?? 6;
  const seed = opts.seed ?? 0;
  const metric = opts.metric ?? "f1";
  const jitter = clamp(opts.jitter ?? 1, 0, 1);

  // Deterministic per-cell feature point via a hashed RNG.
  function cellPoint(cx: number, cy: number): [number, number, number] {
    // Hash the integer cell coords into a seed.
    const h = ((cx * 374761393) ^ (cy * 668265263) ^ (seed * 2147483647)) >>> 0;
    const rng = makeRng(h);
    const px = cx + 0.5 + (rng.next() - 0.5) * jitter;
    const py = cy + 0.5 + (rng.next() - 0.5) * jitter;
    return [px, py, rng.next()];
  }

  return (u, v) => {
    const x = u * scale;
    const y = v * scale;
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    let f1Val = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const [px, py, val] = cellPoint(gx + ox, gy + oy);
        const dx = px - x;
        const dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          f1Val = val;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    if (metric === "f2-f1") return clamp(f2 - f1, 0, 1);
    if (metric === "cellValue") return f1Val;
    return clamp(f1, 0, 1);
  };
}

/** Linear gradient along an arbitrary direction; returns [0,1]. */
export function gradient(
  angleRad = 0,
): (u: number, v: number) => number {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  // Project (u,v) centered at 0.5 onto the direction, remap to [0,1].
  return (u, v) => clamp((u - 0.5) * dx + (v - 0.5) * dy + 0.5, 0, 1);
}

/** Radial gradient from a center point; returns [0,1] (0 center, 1 edge). */
export function radialGradient(
  cx = 0.5,
  cy = 0.5,
  radius = 0.5,
): (u: number, v: number) => number {
  return (u, v) => {
    const d = Math.hypot(u - cx, v - cy) / radius;
    return clamp(d, 0, 1);
  };
}

export interface RampStop {
  /** Position 0..1. */
  at: number;
  /** Linear RGB. */
  color: [number, number, number];
}

/**
 * Color ramp: map a scalar field to RGB via sorted stops with linear
 * interpolation. The bread-and-butter of "height/noise -> color".
 */
export function ramp(stops: RampStop[]): (t: number) => [number, number, number] {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  return (t) => {
    const x = clamp(t, 0, 1);
    if (x <= sorted[0]!.at) return sorted[0]!.color;
    const last = sorted[sorted.length - 1]!;
    if (x >= last.at) return last.color;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (x >= a.at && x <= b.at) {
        const f = (x - a.at) / (b.at - a.at);
        return [
          a.color[0] + (b.color[0] - a.color[0]) * f,
          a.color[1] + (b.color[1] - a.color[1]) * f,
          a.color[2] + (b.color[2] - a.color[2]) * f,
        ];
      }
    }
    return last.color;
  };
}

/** Blend two scalars by a mask value (0 -> a, 1 -> b). */
export function blend(a: number, b: number, mask: number): number {
  return a + (b - a) * clamp(mask, 0, 1);
}

/** Blend two RGB colors by a mask. */
export function blendColor(
  a: [number, number, number],
  b: [number, number, number],
  mask: number,
): [number, number, number] {
  const m = clamp(mask, 0, 1);
  return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];
}

/** Threshold a value into a soft 0..1 mask around edge with given softness. */
export function threshold(value: number, edge: number, softness = 0.05): number {
  return smoothstep(edge - softness, edge + softness, value);
}
