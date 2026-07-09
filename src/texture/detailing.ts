/**
 * AA surface-detailing helpers — ported (self-written from public knowledge)
 * from the UE Electric Dreams / Megascans material-function toolbox. These are
 * the tricks that separate a flat "plastic-looking" procedural texture from a
 * believable AAA surface:
 *
 *  - hexTile:            break the visible repeat of a tiling pattern by sampling
 *                        it through a randomly rotated/offset hex grid (UE
 *                        MF_HexMask / MF_UVRandom, a.k.a. "stochastic /
 *                        texture-bombing" tiling).
 *  - worldColorVariation: add large-scale low-frequency color drift keyed to
 *                        world position so one material reads differently across
 *                        a scene (UE MF_WorldspaceColorVariation) — kills the
 *                        "same texture everywhere" plastic feel.
 *  - upwardMask:         a 0..1 mask from how much a surface normal points up,
 *                        for moss/snow/dust that only grows on top faces (UE
 *                        MF_DFAO_MossGrowth style "up" mask).
 *  - heightBlendMask:    height-map + noise driven hard-edge blend factor between
 *                        two layers (UE M_BlendMoss / MF_Blend_Through_Input) —
 *                        rock in the crevices, moss on the raised bits, with a
 *                        crisp transition instead of a muddy lerp.
 *
 * Everything is deterministic (seeded) and side-effect free, matching the rest
 * of the texture DSL: patterns are (u,v)->scalar, colors are RGB tuples.
 */
import type { RGB } from "./color.js";
import { makeNoise, fbm2, type FbmOptions } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { clamp, smoothstep } from "../math/scalar.js";

/** A tiling texture pattern: (u,v) -> scalar in [0,1]. */
export type TexScalarField = (u: number, v: number) => number;
/** A texture color field: (u,v) -> linear RGB. */
export type TexColorField = (u: number, v: number) => RGB;

// ---------------------------------------------------------------------------
// Hex-grid stochastic tiling — MF_HexMask / MF_UVRandom.
// ---------------------------------------------------------------------------

export interface HexTileOptions {
  /** Density of the hex grid (higher = smaller cells, more variety). */
  scale?: number;
  /** Random rotation range in radians applied per hex cell. Default full turn. */
  rotationJitter?: number;
  /** Random UV offset magnitude per hex cell (in the source pattern's space). */
  offsetJitter?: number;
  /** Seed for the per-cell random rotate/offset. */
  seed?: number;
}

/** Convert an axial hex coord to a stable per-cell random pair via hashed RNG. */
function hexCellRandom(q: number, r: number, seed: number): { rot: number; ox: number; oy: number } {
  const h = ((q * 374761393) ^ (r * 668265263) ^ (seed * 2147483647)) >>> 0;
  const rng = makeRng(h);
  return { rot: rng.next(), ox: rng.next(), oy: rng.next() };
}

/**
 * Sample a source pattern through a random hex grid so its repeat becomes
 * invisible. Each hexagon rotates and offsets the lookup by a per-cell random
 * amount; at cell borders we blend the three nearest cells by barycentric
 * weight (the classic hex-tiling / texture-bombing scheme). The source pattern
 * should itself be seamlessly tileable for best results.
 */
export function hexTile(
  source: TexScalarField,
  opts: HexTileOptions = {},
): TexScalarField {
  const scale = opts.scale ?? 4;
  const rotJit = opts.rotationJitter ?? Math.PI * 2;
  const offJit = opts.offsetJitter ?? 1;
  const seed = opts.seed ?? 0;

  // Sample the source with a per-cell rotation about the cell centre + offset.
  const sampleCell = (u: number, v: number, q: number, r: number): number => {
    const { rot, ox, oy } = hexCellRandom(q, r, seed);
    const ang = (rot - 0.5) * rotJit;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // rotate around the sample point, then push by a random offset
    const du = u - 0.5;
    const dv = v - 0.5;
    const ru = du * ca - dv * sa + 0.5 + (ox - 0.5) * offJit;
    const rv = du * sa + dv * ca + 0.5 + (oy - 0.5) * offJit;
    return source(ru, rv);
  };

  return (u, v) => {
    // Skew (u,v) into a triangular/hex lattice; find the enclosing simplex.
    const sx = u * scale;
    const sy = v * scale;
    // axial hex via the standard skewed-grid + two-triangle split
    const skew = (sx + sy) * 0.5;
    const i = Math.floor(sx + skew);
    const j = Math.floor(sy + skew);
    const unskew = (i + j) * (1 / 4);
    const fx = sx - (i - unskew);
    const fy = sy - (j - unskew);
    // three nearest cell centres (this + two neighbours), distance weights
    const cells: Array<[number, number]> = fx > fy
      ? [[i, j], [i + 1, j], [i + 1, j + 1]]
      : [[i, j], [i, j + 1], [i + 1, j + 1]];
    let sum = 0;
    let wsum = 0;
    for (const [cq, cr] of cells) {
      const w = 1 / (1e-4 + Math.hypot(cq - (sx + skew - 0.5), cr - (sy + skew - 0.5)));
      sum += sampleCell(u, v, cq, cr) * w;
      wsum += w;
    }
    return wsum > 0 ? clamp(sum / wsum, 0, 1) : source(u, v);
  };
}

// ---------------------------------------------------------------------------
// World-space color variation — MF_WorldspaceColorVariation.
// ---------------------------------------------------------------------------

export interface WorldColorOptions {
  /** Low frequency of the variation field (small = broad patches). */
  frequency?: number;
  /** Hue/brightness swing amount 0..1. */
  strength?: number;
  /** Secondary tint pushed toward at the field's high end (linear RGB). */
  tint?: RGB;
  /** fBm settings for the drift field. */
  fbm?: FbmOptions;
  /** Seed. */
  seed?: number;
}

/**
 * Wrap a base color field and modulate it by a broad low-frequency noise keyed
 * to (u,v) as a stand-in for world position. Produces gentle darker/lighter
 * and toward-tint drift so large surfaces stop looking uniform. Use a small
 * frequency (0.3–1.5) relative to the base pattern.
 */
export function worldColorVariation(
  base: TexColorField,
  opts: WorldColorOptions = {},
): TexColorField {
  const freq = opts.frequency ?? 0.6;
  const strength = clamp(opts.strength ?? 0.35, 0, 1);
  const tint = opts.tint;
  const noise = makeNoise((opts.seed ?? 0) >>> 0);
  return (u, v) => {
    const c = base(u, v);
    // two decorrelated low-freq fields: one for brightness, one for tint mix
    const bright = fbm2(noise, u * freq + 3.1, v * freq - 1.7, opts.fbm) * 0.5 + 0.5;
    const tmix = fbm2(noise, u * freq - 5.3, v * freq + 4.2, opts.fbm) * 0.5 + 0.5;
    const bf = 1 + (bright - 0.5) * 2 * strength; // 1±strength
    let r = c[0] * bf;
    let g = c[1] * bf;
    let b = c[2] * bf;
    if (tint) {
      const m = tmix * strength;
      r = r + (tint[0] - r) * m;
      g = g + (tint[1] - g) * m;
      b = b + (tint[2] - b) * m;
    }
    return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
  };
}

// ---------------------------------------------------------------------------
// Upward-facing mask — MF_DFAO_MossGrowth "up" term.
// ---------------------------------------------------------------------------

export interface UpwardMaskOptions {
  /** Normal.y at which the mask starts rising (below = 0). Default 0.3. */
  start?: number;
  /** Normal.y at which the mask is fully 1. Default 0.75. */
  full?: number;
  /** Optional per-texel noise break-up of the edge (0..1 amount). */
  noiseBreakup?: number;
  /** Noise scale for the break-up. */
  noiseScale?: number;
  /** Seed for break-up noise. */
  seed?: number;
}

/**
 * Build a mask from a surface normal's up component (n.y): 0 on vertical/under
 * faces, 1 on top faces, with a soft ramp between `start` and `full`. Optional
 * noise breaks the ramp so moss/snow doesn't stop at a perfect contour line.
 * Returns a function of (ny, u, v) so callers can feed per-vertex or per-texel
 * normals.
 */
export function upwardMask(
  opts: UpwardMaskOptions = {},
): (ny: number, u?: number, v?: number) => number {
  const start = opts.start ?? 0.3;
  const full = opts.full ?? 0.75;
  const breakup = clamp(opts.noiseBreakup ?? 0, 0, 1);
  const nScale = opts.noiseScale ?? 8;
  const noise = makeNoise((opts.seed ?? 0) >>> 0);
  return (ny, u = 0, v = 0) => {
    let m = smoothstep(start, full, ny);
    if (breakup > 0) {
      const n = fbm2(noise, u * nScale, v * nScale, { octaves: 3 }) * 0.5 + 0.5;
      // bias the threshold by noise so the edge wanders
      m = clamp(m + (n - 0.5) * 2 * breakup, 0, 1);
      m = smoothstep(0.35, 0.65, m);
    }
    return m;
  };
}

// ---------------------------------------------------------------------------
// Height-blend mask — M_BlendMoss / MF_Blend_Through_Input.
// ---------------------------------------------------------------------------

export interface HeightBlendOptions {
  /** Blend position 0..1: how far layer B has taken over. */
  amount: number;
  /** Transition hardness 0..1 (1 = crisp, 0 = soft lerp). Default 0.5. */
  contrast?: number;
  /** Extra per-texel noise jitter on the height so the seam looks organic. */
  jitter?: number;
  /** Noise scale for the jitter. */
  jitterScale?: number;
  /** Seed. */
  seed?: number;
}

/**
 * Turn a height field into a hard-edged blend mask between two layers. Instead
 * of a flat crossfade, layer B wins wherever `height + amount` clears a
 * contrast-controlled threshold — so B settles into the low spots (or, flipped,
 * caps the high spots). This is the core of realistic moss-in-crevices,
 * snow-on-ledges, worn-edge blends.
 */
export function heightBlendMask(
  height: TexScalarField,
  opts: HeightBlendOptions,
): TexScalarField {
  const amount = clamp(opts.amount, 0, 1);
  const contrast = clamp(opts.contrast ?? 0.5, 0, 1);
  const jitter = clamp(opts.jitter ?? 0, 0, 1);
  const jScale = opts.jitterScale ?? 12;
  const noise = makeNoise((opts.seed ?? 0) >>> 0);
  // wider transition band when contrast is low, near-zero when crisp
  const band = 0.5 * (1 - contrast) + 0.02;
  return (u, v) => {
    let h = height(u, v);
    if (jitter > 0) {
      h = clamp(h + (fbm2(noise, u * jScale, v * jScale, { octaves: 2 }) * 0.5) * jitter, 0, 1);
    }
    // amount drives the threshold: amount=1 => B everywhere, 0 => A everywhere
    const threshold = 1 - amount;
    return smoothstep(threshold - band, threshold + band, h);
  };
}
