/**
 * Deterministic gradient (Perlin-style) noise + fractal Brownian motion.
 *
 * Self-rewritten from public algorithm knowledge (Perlin's improved noise
 * permutation + gradient hashing). No code copied from any GPL source.
 *
 * Seeded: the permutation table is shuffled by a seeded RNG, so the same
 * seed yields the same field. Output of noise2/noise3 is in [-1, 1].
 */
import { makeRng } from "./prng.js";

function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  // Fisher–Yates with seeded RNG.
  const rng = makeRng(seed);
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]!;
  return p;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function grad2(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    default:
      return -x - y;
  }
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export interface Noise {
  /** 2D noise in [-1, 1]. */
  noise2(x: number, y: number): number;
  /** 3D noise in [-1, 1]. */
  noise3(x: number, y: number, z: number): number;
}

export interface FbmOptions {
  octaves?: number;
  /** Frequency multiplier per octave. */
  lacunarity?: number;
  /** Amplitude multiplier per octave. */
  gain?: number;
}

class PerlinNoise implements Noise {
  private p: Uint8Array;

  constructor(seed: number) {
    this.p = buildPermutation(seed);
  }

  noise2(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const p = this.p;
    const aa = p[p[X]! + Y]!;
    const ab = p[p[X]! + Y + 1]!;
    const ba = p[p[X + 1]! + Y]!;
    const bb = p[p[X + 1]! + Y + 1]!;
    const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
    const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  noise3(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const p = this.p;
    const A = p[X]! + Y;
    const AA = p[A]! + Z;
    const AB = p[A + 1]! + Z;
    const B = p[X + 1]! + Y;
    const BA = p[B]! + Z;
    const BB = p[B + 1]! + Z;
    const x1 = lerp(grad3(p[AA]!, xf, yf, zf), grad3(p[BA]!, xf - 1, yf, zf), u);
    const x2 = lerp(
      grad3(p[AB]!, xf, yf - 1, zf),
      grad3(p[BB]!, xf - 1, yf - 1, zf),
      u,
    );
    const y1 = lerp(x1, x2, v);
    const x3 = lerp(
      grad3(p[AA + 1]!, xf, yf, zf - 1),
      grad3(p[BA + 1]!, xf - 1, yf, zf - 1),
      u,
    );
    const x4 = lerp(
      grad3(p[AB + 1]!, xf, yf - 1, zf - 1),
      grad3(p[BB + 1]!, xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = lerp(x3, x4, v);
    return lerp(y1, y2, w);
  }
}

/** Create a seeded Perlin noise source. */
export function makeNoise(seed: number): Noise {
  return new PerlinNoise(seed);
}

/** Fractal Brownian motion over a 2D noise field. Output roughly [-1, 1]. */
export function fbm2(
  noise: Noise,
  x: number,
  y: number,
  opts: FbmOptions = {},
): number {
  const octaves = opts.octaves ?? 5;
  const lacunarity = opts.lacunarity ?? 2;
  const gain = opts.gain ?? 0.5;
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise.noise2(x * freq, y * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Fractal Brownian motion over a 3D noise field. Output roughly [-1, 1]. */
export function fbm3(
  noise: Noise,
  x: number,
  y: number,
  z: number,
  opts: FbmOptions = {},
): number {
  const octaves = opts.octaves ?? 5;
  const lacunarity = opts.lacunarity ?? 2;
  const gain = opts.gain ?? 0.5;
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise.noise3(x * freq, y * freq, z * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

export * from "./prng.js";
