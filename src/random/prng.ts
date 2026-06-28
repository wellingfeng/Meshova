/**
 * Deterministic pseudo-random number generator.
 *
 * Same seed -> same sequence, across machines and runs. This is a hard
 * requirement of Meshova: screenshot tests and AI reproduction depend on it.
 *
 * Algorithm: SplitMix64 to expand the seed, then xoshiro128** for the stream.
 * All math stays in 32-bit lanes via Math.imul / >>> 0 so results are
 * bit-stable in JS engines.
 */

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next float in [min, max). */
  range(min: number, max: number): number;
  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Fork a new independent stream, deterministically derived from this one. */
  fork(): Rng;
}

class Xoshiro128 implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: [number, number, number, number]) {
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
  }

  private nextUint(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0;
    this.s1 >>>= 0;
    this.s2 >>>= 0;
    this.s3 >>>= 0;
    return result;
  }

  next(): number {
    // 53-bit-ish float in [0,1) from the top 32 bits.
    return this.nextUint() / 0x1_0000_0000;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  fork(): Rng {
    return makeRng(this.nextUint());
  }
}

/** Create a deterministic RNG from an integer seed. */
export function makeRng(seed: number): Rng {
  const sm = splitmix32(seed | 0);
  return new Xoshiro128([sm(), sm(), sm(), sm()]);
}
