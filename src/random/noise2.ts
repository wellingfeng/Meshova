/**
 * Extended noise: periodic (tileable) noise, cellular/Worley noise, and
 * curl noise — VEX parity (pnoise, cellnoise/wnoise, curlnoise).
 *
 * Self-rewritten from public algorithm descriptions. All seeded and
 * deterministic, matching Meshova's reproducibility contract.
 */
import type { Noise } from "./noise.js";

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

/**
 * VEX `cellnoise` (2D): per-cell constant random value in [0,1).
 * Flat shading per integer cell — handy for ID masks and random tints.
 */
export function cellNoise2(x: number, y: number, seed = 0): number {
  return hash2(Math.floor(x), Math.floor(y), seed);
}

export function cellNoise3(x: number, y: number, z: number, seed = 0): number {
  return hash3(Math.floor(x), Math.floor(y), Math.floor(z), seed);
}

export interface WorleyResult {
  /** Distance to nearest feature point (F1). */
  f1: number;
  /** Distance to second-nearest (F2). */
  f2: number;
  /** Random id in [0,1) of the nearest cell. */
  id: number;
}

/**
 * VEX `wnoise` / Worley cellular noise (2D). Returns F1, F2 distances and a
 * per-cell id. jitter in 0..1 controls how far feature points wander from
 * cell centers. distances are in cell-space units.
 */
export function worley2(
  x: number,
  y: number,
  seed = 0,
  jitter = 1,
): WorleyResult {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      const fx = cx + jitter * hash2(cx, cy, seed);
      const fy = cy + jitter * hash2(cx, cy, seed + 1013);
      const dx = fx - x;
      const dy = fy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(cx, cy, seed + 7919);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, id };
}

/** Worley cellular noise (3D). */
export function worley3(
  x: number,
  y: number,
  z: number,
  seed = 0,
  jitter = 1,
): WorleyResult {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  for (let oz = -1; oz <= 1; oz++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox;
        const cy = yi + oy;
        const cz = zi + oz;
        const fx = cx + jitter * hash3(cx, cy, cz, seed);
        const fy = cy + jitter * hash3(cx, cy, cz, seed + 1013);
        const fz = cz + jitter * hash3(cx, cy, cz, seed + 2027);
        const dx = fx - x;
        const dy = fy - y;
        const dz = fz - z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = hash3(cx, cy, cz, seed + 7919);
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return { f1, f2, id };
}

/**
 * VEX `pnoise` (2D periodic noise): like noise but tiles seamlessly over the
 * integer period (px,py). Output in [-1,1]. Implemented by wrapping lattice
 * lookups against the period.
 */
export function pnoise2(
  noise: Noise,
  x: number,
  y: number,
  px: number,
  py: number,
): number {
  // Blend four copies of the field so opposite edges match.
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const x0 = wrap(Math.floor(x), px);
  const y0 = wrap(Math.floor(y), py);
  const x1 = wrap(x0 + 1, px);
  const y1 = wrap(y0 + 1, py);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = noise.noise2(x0, y0);
  const n10 = noise.noise2(x1, y0);
  const n01 = noise.noise2(x0, y1);
  const n11 = noise.noise2(x1, y1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/**
 * VEX `curlnoise` (2D): divergence-free flow field derived from a noise
 * potential. Returns a {x,y} velocity. eps controls the finite-difference
 * step. Great for swirl/flow displacement that never sources or sinks.
 */
export function curlNoise2(
  noise: Noise,
  x: number,
  y: number,
  eps = 1e-3,
): { x: number; y: number } {
  // Use 3D noise as a scalar potential field; curl of (0,0,P) in 2D.
  const dpdx =
    (noise.noise3(x + eps, y, 0) - noise.noise3(x - eps, y, 0)) / (2 * eps);
  const dpdy =
    (noise.noise3(x, y + eps, 0) - noise.noise3(x, y - eps, 0)) / (2 * eps);
  return { x: dpdy, y: -dpdx };
}

/**
 * VEX `curlnoise` (3D): divergence-free 3D flow field from a vector potential
 * built out of three offset noise lookups. Returns {x,y,z} velocity.
 */
export function curlNoise3(
  noise: Noise,
  x: number,
  y: number,
  z: number,
  eps = 1e-3,
): { x: number; y: number; z: number } {
  const pot = (ox: number, oy: number, oz: number) => ({
    x: noise.noise3(x + ox, y + oy, z + oz),
    y: noise.noise3(x + ox + 31.4, y + oy + 17.2, z + oz + 53.7),
    z: noise.noise3(x + ox - 11.9, y + oy - 23.1, z + oz - 47.3),
  });
  const p_x0 = pot(-eps, 0, 0);
  const p_x1 = pot(eps, 0, 0);
  const p_y0 = pot(0, -eps, 0);
  const p_y1 = pot(0, eps, 0);
  const p_z0 = pot(0, 0, -eps);
  const p_z1 = pot(0, 0, eps);
  const inv = 1 / (2 * eps);
  // curl = (dPz/dy - dPy/dz, dPx/dz - dPz/dx, dPy/dx - dPx/dy)
  return {
    x: (p_y1.z - p_y0.z - (p_z1.y - p_z0.y)) * inv,
    y: (p_z1.x - p_z0.x - (p_x1.z - p_x0.z)) * inv,
    z: (p_x1.y - p_x0.y - (p_y1.x - p_y0.x)) * inv,
  };
}

/**
 * VEX `flownoise` (2D): noise that evolves over a flow parameter `t` by
 * rotating the gradient field, giving a swirling animated look without
 * directional sliding. Output in [-1,1]. Implemented as a blend of two phase-
 * shifted 3D noise lookups around a circular path in the extra dimension.
 */
export function flowNoise2(
  noise: Noise,
  x: number,
  y: number,
  t: number,
): number {
  const cs = Math.cos(t * Math.PI * 2);
  const sn = Math.sin(t * Math.PI * 2);
  // Two lookups on a small circle in z; blend by the flow phase so the field
  // rotates rather than translates.
  const a = noise.noise3(x, y, 0.5 * cs);
  const b = noise.noise3(x + sn * 0.5, y - sn * 0.5, 0.5 * sn);
  return a * (0.5 + 0.5 * cs) + b * (0.5 - 0.5 * cs);
}

/**
 * VEX `gxnoise` style anisotropic gradient noise (2D): scales the sampling
 * frequency independently per axis and along an arbitrary direction, so the
 * features stretch (good for brushed metal, wood grain, fur flow).
 * `aniso` >1 stretches features along `angle` (radians). Output in [-1,1].
 */
export function anisoNoise2(
  noise: Noise,
  x: number,
  y: number,
  angle: number,
  aniso: number,
): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // rotate into the anisotropy frame, squash the along-axis, then sample
  const u = (x * c + y * s) / Math.max(1e-6, aniso);
  const v = -x * s + y * c;
  return noise.noise2(u, v);
}

/**
 * Domain-warped fbm (2D): warps the lookup coordinates by another noise field
 * before sampling — the classic Inigo Quilez warp for organic clouds/marble.
 * `warp` controls displacement strength. Output roughly [-1,1].
 */
export function warpedNoise2(
  noise: Noise,
  x: number,
  y: number,
  warp = 1,
): number {
  const qx = noise.noise2(x, y);
  const qy = noise.noise2(x + 5.2, y + 1.3);
  return noise.noise2(x + warp * qx, y + warp * qy);
}

