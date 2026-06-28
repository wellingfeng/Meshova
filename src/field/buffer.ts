/**
 * Scalar Field2D buffer: shared mask/weight layer between geometry and texture.
 *
 * Field2D is not a material texture and not a mesh attribute. It is the neutral
 * intermediate representation for seams, profiles, scatter density, bevel
 * bands, UV masks and AI-editable shape controls.
 *
 * Layout: row-major, one float per pixel. UV convention matches texture core:
 * u in [0,1] left->right, v in [0,1] bottom->top.
 */
import { clamp, lerp } from "../math/scalar.js";

export interface Field2D {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export function makeField2D(width: number, height: number, fill = 0): Field2D {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const data = new Float32Array(w * h);
  if (fill !== 0) data.fill(fill);
  return { width: w, height: h, data };
}

export function field2DIndex(field: Field2D, x: number, y: number): number {
  return y * field.width + x;
}

export function cloneField2D(field: Field2D): Field2D {
  const out = makeField2D(field.width, field.height);
  out.data.set(field.data);
  return out;
}

export function generateField2D(
  width: number,
  height: number,
  fn: (u: number, v: number, x: number, y: number) => number,
): Field2D {
  const out = makeField2D(width, height);
  for (let y = 0; y < out.height; y++) {
    const v = 1 - (y + 0.5) / out.height;
    for (let x = 0; x < out.width; x++) {
      const u = (x + 0.5) / out.width;
      out.data[y * out.width + x] = fn(u, v, x, y);
    }
  }
  return out;
}

/** Integer pixel lookup with clamped edges. */
export function sampleField2D(field: Field2D, x: number, y: number): number {
  const xi = clamp(Math.floor(x), 0, field.width - 1);
  const yi = clamp(Math.floor(y), 0, field.height - 1);
  return field.data[yi * field.width + xi]!;
}

/** Bilinear lookup in pixel coordinates, with clamped edges. */
export function sampleField2DBilinear(field: Field2D, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const a = sampleField2D(field, x0, y0);
  const b = sampleField2D(field, x0 + 1, y0);
  const c = sampleField2D(field, x0, y0 + 1);
  const d = sampleField2D(field, x0 + 1, y0 + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/** Bilinear lookup in UV space. */
export function sampleField2DUV(field: Field2D, u: number, v: number): number {
  const x = clamp(u, 0, 1) * (field.width - 1);
  const y = (1 - clamp(v, 0, 1)) * (field.height - 1);
  return sampleField2DBilinear(field, x, y);
}

export function mapField2D(
  field: Field2D,
  fn: (value: number, u: number, v: number, x: number, y: number) => number,
): Field2D {
  const out = makeField2D(field.width, field.height);
  for (let y = 0; y < field.height; y++) {
    const v = 1 - (y + 0.5) / field.height;
    for (let x = 0; x < field.width; x++) {
      const u = (x + 0.5) / field.width;
      const i = y * field.width + x;
      out.data[i] = fn(field.data[i]!, u, v, x, y);
    }
  }
  return out;
}

export function assertSameField2D(a: Field2D, b: Field2D): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Field2D size mismatch ${a.width}x${a.height} != ${b.width}x${b.height}`);
  }
}

export function zipField2D(
  a: Field2D,
  b: Field2D,
  fn: (av: number, bv: number, x: number, y: number) => number,
): Field2D {
  assertSameField2D(a, b);
  const out = makeField2D(a.width, a.height);
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = y * a.width + x;
      out.data[i] = fn(a.data[i]!, b.data[i]!, x, y);
    }
  }
  return out;
}

export interface Field2DStats {
  min: number;
  max: number;
  mean: number;
}

export function field2DStats(field: Field2D): Field2DStats {
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

export function normalizeField2D(field: Field2D, outLow = 0, outHigh = 1): Field2D {
  const s = field2DStats(field);
  const span = s.max - s.min;
  if (span === 0) return makeField2D(field.width, field.height, outLow);
  return mapField2D(field, (v) => outLow + ((v - s.min) / span) * (outHigh - outLow));
}
