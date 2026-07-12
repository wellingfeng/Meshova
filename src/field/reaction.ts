/**
 * Gray-Scott reaction-diffusion on Field2D.
 *
 * Good proxy for Houdini-style reaction diffusion, growth and spot patterns.
 * Deterministic: same seed + same params -> same field.
 */
import { makeRng } from "../random/prng.js";
import { clamp } from "../math/scalar.js";
import { makeField2D, type Field2D } from "./buffer.js";

export interface GrayScottOptions {
  iterations?: number;
  dt?: number;
  diffU?: number;
  diffV?: number;
  feed?: number;
  kill?: number;
  seed?: number;
  spots?: number;
  spotRadius?: number;
  spotRadiusRange?: [number, number];
  wrap?: boolean;
}

export interface GrayScottState {
  u: Field2D;
  v: Field2D;
}

const KERNEL = [
  [0.05, 0.2, 0.05],
  [0.2, -1, 0.2],
  [0.05, 0.2, 0.05],
] as const;

function sampleWrap(field: Field2D, x: number, y: number, wrap: boolean): number {
  if (wrap) {
    const xi = ((x % field.width) + field.width) % field.width;
    const yi = ((y % field.height) + field.height) % field.height;
    return field.data[yi * field.width + xi]!;
  }
  const xi = clamp(x, 0, field.width - 1);
  const yi = clamp(y, 0, field.height - 1);
  return field.data[yi * field.width + xi]!;
}

function laplace(field: Field2D, x: number, y: number, wrap: boolean): number {
  let sum = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      sum += sampleWrap(field, x + i, y + j, wrap) * KERNEL[j + 1]![i + 1]!;
    }
  }
  return sum;
}

export function grayScottState2D(width: number, height: number, opts: GrayScottOptions = {}): GrayScottState {
  const u = makeField2D(width, height, 1);
  const v = makeField2D(width, height, 0);
  const rng = makeRng(opts.seed ?? 0);
  const spots = Math.max(1, Math.floor(opts.spots ?? 6));
  const minDim = Math.min(width, height);
  const radiusRange = opts.spotRadiusRange ?? [Math.max(2, minDim * 0.03), Math.max(4, minDim * 0.08)];
  const radiusBase = opts.spotRadius ?? 0;

  for (let i = 0; i < spots; i++) {
    const cx = Math.floor(rng.range(0, width));
    const cy = Math.floor(rng.range(0, height));
    const radius = radiusBase > 0 ? radiusBase : rng.range(radiusRange[0], radiusRange[1]);
    const r2 = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const idx = y * width + x;
        u.data[idx] = 0;
        v.data[idx] = 1;
      }
    }
  }

  return { u, v };
}

export function grayScottStep2D(state: GrayScottState, opts: GrayScottOptions = {}): GrayScottState {
  const du = opts.diffU ?? 0.16;
  const dv = opts.diffV ?? 0.08;
  const feed = opts.feed ?? 0.035;
  const kill = opts.kill ?? 0.065;
  const dt = opts.dt ?? 1;
  const wrap = opts.wrap ?? true;

  const w = state.u.width;
  const h = state.u.height;
  const nextU = makeField2D(w, h);
  const nextV = makeField2D(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = state.u.data[i]!;
      const v = state.v.data[i]!;
      const lu = laplace(state.u, x, y, wrap);
      const lv = laplace(state.v, x, y, wrap);
      const uvv = u * v * v;
      const duDt = du * lu - uvv + feed * (1 - u);
      const dvDt = dv * lv + uvv - (feed + kill) * v;
      nextU.data[i] = clamp(u + duDt * dt, 0, 1);
      nextV.data[i] = clamp(v + dvDt * dt, 0, 1);
    }
  }
  return { u: nextU, v: nextV };
}

export function grayScottField2D(width: number, height: number, opts: GrayScottOptions = {}): Field2D {
  let state = grayScottState2D(width, height, opts);
  const iterations = Math.max(1, Math.floor(opts.iterations ?? 24));
  for (let i = 0; i < iterations; i++) state = grayScottStep2D(state, opts);
  return state.v;
}
