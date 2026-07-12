/**
 * Extended texture patterns (P10): fractal noise variants (multifractal,
 * ridged, hetero-terrain), wave, brick, and smooth Voronoi. Self-written from
 * public algorithm knowledge (Musgrave fractal family, standard brick/wave).
 *
 * All return functions (u,v) -> scalar in [0,1] unless noted, deterministic
 * given their seed.
 */
import { makeNoise, type Noise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { clamp, smoothstep } from "../math/scalar.js";

export interface FractalOptions {
  scale?: number;
  octaves?: number;
  lacunarity?: number;
  /** Fractal dimension control (H): higher = smoother. */
  h?: number;
  offset?: number;
  gain?: number;
}

/**
 * Multifractal: octaves are multiplied rather than summed, giving uneven
 * detail (smooth valleys, busy peaks). Good for varied terrain/rock.
 */
export function multiFractal(
  seed: number,
  opts: FractalOptions = {},
): (u: number, v: number) => number {
  const n = makeNoise(seed);
  const scale = opts.scale ?? 4;
  const octaves = opts.octaves ?? 5;
  const lac = opts.lacunarity ?? 2;
  const h = opts.h ?? 1;
  const offset = opts.offset ?? 0.5;
  return (u, v) => {
    let value = 1;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      const sig = n.noise2(u * scale * freq, v * scale * freq) + offset;
      value *= sig * Math.pow(freq, -h);
      freq *= lac;
    }
    // normalize roughly to [0,1]
    return clamp(value * 0.5, 0, 1);
  };
}

/**
 * Ridged multifractal: 1 - |noise| folded and accumulated, producing sharp
 * ridges and crevices. The classic for mountain ridges and eroded rock.
 */
export function ridgedMultiFractal(
  seed: number,
  opts: FractalOptions = {},
): (u: number, v: number) => number {
  const n = makeNoise(seed);
  const scale = opts.scale ?? 4;
  const octaves = opts.octaves ?? 5;
  const lac = opts.lacunarity ?? 2;
  const h = opts.h ?? 1;
  const offset = opts.offset ?? 1;
  const gain = opts.gain ?? 2;
  return (u, v) => {
    let freq = 1;
    let signal = offset - Math.abs(n.noise2(u * scale, v * scale));
    signal *= signal;
    let result = signal;
    let weight = 1;
    for (let o = 1; o < octaves; o++) {
      freq *= lac;
      weight = clamp(signal * gain, 0, 1);
      let s = offset - Math.abs(n.noise2(u * scale * freq, v * scale * freq));
      s *= s;
      s *= weight;
      result += s * Math.pow(freq, -h);
      signal = s;
    }
    return clamp(result * 0.5, 0, 1);
  };
}

/**
 * Hetero-terrain: first octave acts as a base height that modulates how much
 * later octaves contribute, so flat areas stay flat and high areas get rough.
 */
export function heteroTerrain(
  seed: number,
  opts: FractalOptions = {},
): (u: number, v: number) => number {
  const n = makeNoise(seed);
  const scale = opts.scale ?? 4;
  const octaves = opts.octaves ?? 5;
  const lac = opts.lacunarity ?? 2;
  const h = opts.h ?? 1;
  const offset = opts.offset ?? 0.7;
  return (u, v) => {
    let freq = 1;
    let value = offset + n.noise2(u * scale, v * scale);
    for (let o = 1; o < octaves; o++) {
      freq *= lac;
      const increment = (n.noise2(u * scale * freq, v * scale * freq) + offset) * Math.pow(freq, -h);
      value += increment * value;
    }
    return clamp(value * 0.25, 0, 1);
  };
}

export interface WaveOptions {
  scale?: number;
  /** "bands" = straight stripes, "rings" = concentric circles. */
  type?: "bands" | "rings";
  /** Direction angle for bands (radians). */
  angle?: number;
  /** Noise distortion amount applied to the wave phase. */
  distortion?: number;
  seed?: number;
}

/**
 * Wave texture: sine bands or rings, optionally distorted by noise. Classic
 * for wood grain (rings) and striped/brushed looks (bands). Returns [0,1].
 */
export function wave(opts: WaveOptions = {}): (u: number, v: number) => number {
  const scale = opts.scale ?? 6;
  const type = opts.type ?? "bands";
  const angle = opts.angle ?? 0;
  const distortion = opts.distortion ?? 0;
  const n = makeNoise(opts.seed ?? 0);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return (u, v) => {
    let phase: number;
    if (type === "rings") {
      phase = Math.hypot(u - 0.5, v - 0.5) * scale;
    } else {
      phase = ((u - 0.5) * dx + (v - 0.5) * dy) * scale;
    }
    if (distortion > 0) phase += n.noise2(u * scale, v * scale) * distortion;
    return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
  };
}

export interface BrickOptions {
  /** Bricks across the width. */
  columns?: number;
  /** Brick rows across the height. */
  rows?: number;
  /** Mortar gap fraction (0..0.5). */
  mortar?: number;
  /** Row horizontal offset fraction (0.5 = running bond). */
  offset?: number;
  /** Fixed rotation inside each brick cell, in radians. */
  rotation?: number;
  /** Seeded per-brick rotation range, in radians. */
  rotationVariation?: number;
  /** Rounded edge width in cell fraction for brickHeight(). */
  bevel?: number;
  /** Seeded per-brick height spread for brickHeight(). */
  heightVariation?: number;
  /** Probability of removing small edge regions in brickHeight(). */
  chipAmount?: number;
  /** Size of chipped edge regions in cell fraction. */
  chipScale?: number;
  seed?: number;
}

export interface BrickSample {
  column: number;
  row: number;
  localU: number;
  localV: number;
  edge: number;
  mask: number;
  value: number;
}

function brickHash(column: number, row: number, seed: number, salt = 0): number {
  const hash = ((column * 73856093) ^ (row * 19349663) ^ (seed * 83492791) ^ salt) >>> 0;
  return makeRng(hash).next();
}

/** Resolve brick-local coordinates and seeded identity for higher-level generators. */
export function sampleBrick(
  uCoord: number,
  vCoord: number,
  opts: BrickOptions = {},
): BrickSample {
  const columns = Math.max(1, opts.columns ?? 6);
  const rows = Math.max(1, opts.rows ?? 12);
  const mortar = clamp(opts.mortar ?? 0.05, 0, 0.49);
  const rowOffset = opts.offset ?? 0.5;
  const row = Math.floor(vCoord * rows);
  const shiftedU = uCoord * columns + (row % 2) * rowOffset;
  const column = Math.floor(shiftedU);
  const rawU = shiftedU - Math.floor(shiftedU);
  const rawV = vCoord * rows - Math.floor(vCoord * rows);
  const value = brickHash(column, row, opts.seed ?? 0);
  const angle = (opts.rotation ?? 0) + (value * 2 - 1) * (opts.rotationVariation ?? 0);
  const cosine = Math.cos(-angle);
  const sine = Math.sin(-angle);
  const centeredU = rawU - 0.5;
  const centeredV = rawV - 0.5;
  const localU = centeredU * cosine - centeredV * sine + 0.5;
  const localV = centeredU * sine + centeredV * cosine + 0.5;
  const edge = Math.min(localU, 1 - localU, localV, 1 - localV);
  const mask = edge > mortar ? 1 : 0;
  return { column, row, localU, localV, edge, mask, value };
}

/**
 * Brick mask: 1 inside a brick, 0 in the mortar gap, with per-brick random
 * value available via brickValue(). The running-bond stagger is configurable.
 */
export function brick(opts: BrickOptions = {}): (u: number, v: number) => number {
  return (uCoord, vCoord) => sampleBrick(uCoord, vCoord, opts).mask;
}

/** Per-brick random value in [0,1], same layout as brick(). For color variation. */
export function brickValue(opts: BrickOptions = {}): (u: number, v: number) => number {
  return (uCoord, vCoord) => sampleBrick(uCoord, vCoord, opts).value;
}

/** Beveled, chipped, per-brick height field. Mortar stays at zero. */
export function brickHeight(opts: BrickOptions = {}): (u: number, v: number) => number {
  const mortar = clamp(opts.mortar ?? 0.05, 0, 0.49);
  const bevel = Math.max(0.001, opts.bevel ?? 0.08);
  const heightVariation = clamp(opts.heightVariation ?? 0.12, 0, 1);
  const chipAmount = clamp(opts.chipAmount ?? 0, 0, 1);
  const chipScale = Math.max(0.001, opts.chipScale ?? 0.08);
  const seed = opts.seed ?? 0;
  return (uCoord, vCoord) => {
    const cell = sampleBrick(uCoord, vCoord, opts);
    if (cell.mask === 0) return 0;
    const edgeHeight = smoothstep(0, bevel, cell.edge - mortar);
    const brickLevel = 1 - heightVariation + cell.value * heightVariation;
    const chipX = Math.floor(cell.localU / chipScale);
    const chipY = Math.floor(cell.localV / chipScale);
    const chipRandom = brickHash(
      cell.column * 97 + chipX,
      cell.row * 101 + chipY,
      seed,
      0x9e3779b9,
    );
    const nearEdge = cell.edge - mortar < chipScale;
    const chipped = nearEdge && chipRandom < chipAmount;
    return clamp(edgeHeight * brickLevel * (chipped ? 0.12 : 1), 0, 1);
  };
}

export interface SmoothVoronoiOptions {
  scale?: number;
  seed?: number;
  /** Smoothing radius; higher = softer cell blending. */
  smoothness?: number;
}

/**
 * Smooth Voronoi (smooth F1): blends cell distances with a smooth-min so cell
 * borders are soft instead of hard creases. Good for organic scales/leather.
 */
export function smoothVoronoi(
  opts: SmoothVoronoiOptions = {},
): (u: number, v: number) => number {
  const scale = opts.scale ?? 6;
  const seed = opts.seed ?? 0;
  const smoothness = Math.max(1e-3, opts.smoothness ?? 1);

  const cellPoint = (cx: number, cy: number): [number, number] => {
    const h = ((cx * 374761393) ^ (cy * 668265263) ^ (seed * 2147483647)) >>> 0;
    const rng = makeRng(h);
    return [cx + rng.next(), cy + rng.next()];
  };

  return (u, v) => {
    const x = u * scale;
    const y = v * scale;
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    let smooth = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const [px, py] = cellPoint(gx + ox, gy + oy);
        const d = Math.hypot(px - x, py - y);
        // exponential smooth-min accumulation
        smooth += Math.exp(-d / smoothness);
      }
    }
    const dist = -smoothness * Math.log(smooth);
    return clamp(dist + 0.5, 0, 1);
  };
}
