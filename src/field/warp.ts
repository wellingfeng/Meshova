import { TAU } from "../math/scalar.js";
import {
  assertSameField2D,
  makeField2D,
  sampleField2D,
  sampleField2DBilinear,
  type Field2D,
} from "./buffer.js";

export interface VectorField2D {
  readonly x: Field2D;
  readonly y: Field2D;
}

export interface WarpField2DOptions {
  /** Multiplier applied to vector values. */
  strength?: number;
  /** pixels = values are pixel offsets; uv = values are UV offsets. */
  units?: "pixels" | "uv";
}

/**
 * Domain warp: resample source at coordinates offset by a vector field.
 * Vector values can be pixel offsets or UV offsets.
 */
export function warpField2D(
  source: Field2D,
  vector: VectorField2D,
  options: WarpField2DOptions = {},
): Field2D {
  assertSameField2D(source, vector.x);
  assertSameField2D(source, vector.y);
  const strength = options.strength ?? 1;
  const units = options.units ?? "pixels";
  const out = makeField2D(source.width, source.height);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const i = y * source.width + x;
      const sx = x + vector.x.data[i]! * strength * (units === "uv" ? source.width : 1);
      const sy = y + vector.y.data[i]! * strength * (units === "uv" ? source.height : 1);
      out.data[i] = sampleField2DBilinear(source, sx, sy);
    }
  }
  return out;
}

export interface DirectionalWarpField2DOptions {
  angle?: number;
  strength?: number;
}

/** Directional warp using one scalar intensity field. */
export function directionalWarpField2D(
  source: Field2D,
  amount: Field2D,
  options: DirectionalWarpField2DOptions = {},
): Field2D {
  assertSameField2D(source, amount);
  const angle = options.angle ?? 0;
  const strength = options.strength ?? 8;
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  const out = makeField2D(source.width, source.height);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const a = sampleField2D(amount, x, y) * strength;
      out.data[y * source.width + x] = sampleField2DBilinear(source, x + dx * a, y + dy * a);
    }
  }
  return out;
}

/** Rotate a vector field by angle, useful before warpField2D composition. */
export function rotateVectorField2D(vector: VectorField2D, angle: number): VectorField2D {
  assertSameField2D(vector.x, vector.y);
  const c = Math.cos(angle % TAU);
  const s = Math.sin(angle % TAU);
  const x = makeField2D(vector.x.width, vector.x.height);
  const y = makeField2D(vector.x.width, vector.x.height);
  for (let i = 0; i < vector.x.data.length; i++) {
    const vx = vector.x.data[i]!;
    const vy = vector.y.data[i]!;
    x.data[i] = vx * c - vy * s;
    y.data[i] = vx * s + vy * c;
  }
  return { x, y };
}
