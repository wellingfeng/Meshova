/**
 * Field3D buffer: neutral scalar volume for SDFs, reaction-diffusion, voxel
 * grids and marching-cubes input.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { clamp, lerp } from "../math/scalar.js";
import type { ScalarGrid } from "../geometry/remesh.js";

export interface Field3D {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly data: Float32Array;
}

export function makeField3D(width: number, height: number, depth: number, fill = 0): Field3D {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const d = Math.max(1, Math.floor(depth));
  const data = new Float32Array(w * h * d);
  if (fill !== 0) data.fill(fill);
  return { width: w, height: h, depth: d, data };
}

export function field3DIndex(field: Field3D, x: number, y: number, z: number): number {
  return (z * field.height + y) * field.width + x;
}

export function cloneField3D(field: Field3D): Field3D {
  const out = makeField3D(field.width, field.height, field.depth);
  out.data.set(field.data);
  return out;
}

export function assertSameField3D(a: Field3D, b: Field3D): void {
  if (a.width !== b.width || a.height !== b.height || a.depth !== b.depth) {
    throw new Error(`Field3D size mismatch ${a.width}x${a.height}x${a.depth} != ${b.width}x${b.height}x${b.depth}`);
  }
}

export function generateField3D(
  width: number,
  height: number,
  depth: number,
  fn: (u: number, v: number, w: number, x: number, y: number, z: number) => number,
): Field3D {
  const out = makeField3D(width, height, depth);
  for (let z = 0; z < out.depth; z++) {
    const w = (z + 0.5) / out.depth;
    for (let y = 0; y < out.height; y++) {
      const v = (y + 0.5) / out.height;
      for (let x = 0; x < out.width; x++) {
        const u = (x + 0.5) / out.width;
        out.data[field3DIndex(out, x, y, z)] = fn(u, v, w, x, y, z);
      }
    }
  }
  return out;
}

export function sampleField3D(field: Field3D, x: number, y: number, z: number): number {
  const xi = clamp(Math.floor(x), 0, field.width - 1);
  const yi = clamp(Math.floor(y), 0, field.height - 1);
  const zi = clamp(Math.floor(z), 0, field.depth - 1);
  return field.data[field3DIndex(field, xi, yi, zi)]!;
}

export function sampleField3DTrilinear(field: Field3D, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;
  const c000 = sampleField3D(field, x0, y0, z0);
  const c100 = sampleField3D(field, x0 + 1, y0, z0);
  const c010 = sampleField3D(field, x0, y0 + 1, z0);
  const c110 = sampleField3D(field, x0 + 1, y0 + 1, z0);
  const c001 = sampleField3D(field, x0, y0, z0 + 1);
  const c101 = sampleField3D(field, x0 + 1, y0, z0 + 1);
  const c011 = sampleField3D(field, x0, y0 + 1, z0 + 1);
  const c111 = sampleField3D(field, x0 + 1, y0 + 1, z0 + 1);
  const c00 = lerp(c000, c100, tx);
  const c10 = lerp(c010, c110, tx);
  const c01 = lerp(c001, c101, tx);
  const c11 = lerp(c011, c111, tx);
  const c0 = lerp(c00, c10, ty);
  const c1 = lerp(c01, c11, ty);
  return lerp(c0, c1, tz);
}

export function sampleField3DUVW(field: Field3D, u: number, v: number, w: number): number {
  const x = clamp(u, 0, 1) * (field.width - 1);
  const y = clamp(v, 0, 1) * (field.height - 1);
  const z = clamp(w, 0, 1) * (field.depth - 1);
  return sampleField3DTrilinear(field, x, y, z);
}

export function mapField3D(
  field: Field3D,
  fn: (value: number, u: number, v: number, w: number, x: number, y: number, z: number) => number,
): Field3D {
  const out = makeField3D(field.width, field.height, field.depth);
  for (let z = 0; z < field.depth; z++) {
    const w = (z + 0.5) / field.depth;
    for (let y = 0; y < field.height; y++) {
      const v = (y + 0.5) / field.height;
      for (let x = 0; x < field.width; x++) {
        const u = (x + 0.5) / field.width;
        const i = field3DIndex(field, x, y, z);
        out.data[i] = fn(field.data[i]!, u, v, w, x, y, z);
      }
    }
  }
  return out;
}

export function zipField3D(
  a: Field3D,
  b: Field3D,
  fn: (av: number, bv: number, x: number, y: number, z: number) => number,
): Field3D {
  assertSameField3D(a, b);
  const out = makeField3D(a.width, a.height, a.depth);
  for (let z = 0; z < a.depth; z++) {
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = field3DIndex(a, x, y, z);
        out.data[i] = fn(a.data[i]!, b.data[i]!, x, y, z);
      }
    }
  }
  return out;
}

export interface Field3DStats {
  min: number;
  max: number;
  mean: number;
}

export function field3DStats(field: Field3D): Field3DStats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of field.data) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / field.data.length };
}

export function normalizeField3D(field: Field3D, outLow = 0, outHigh = 1): Field3D {
  const s = field3DStats(field);
  const span = s.max - s.min;
  if (span === 0) return makeField3D(field.width, field.height, field.depth, outLow);
  return mapField3D(field, (v) => outLow + ((v - s.min) / span) * (outHigh - outLow));
}

export interface ScalarGridOptions {
  origin?: Vec3;
  cell?: number;
}

export function field3DToScalarGrid(field: Field3D, opts: ScalarGridOptions = {}): ScalarGrid {
  const origin = opts.origin ?? vec3(0, 0, 0);
  const cell = opts.cell ?? 1;
  return {
    gx: field.width,
    gy: field.height,
    gz: field.depth,
    origin,
    cell,
    values: Float64Array.from(field.data),
  };
}
