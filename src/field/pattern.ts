import { frac, smoothstep, clamp } from "../math/scalar.js";
import { makeRng } from "../random/prng.js";
import {
  generateField2D,
  makeField2D,
  sampleField2DUV,
  type Field2D,
} from "./buffer.js";

export interface RepeatField2DOptions {
  columns?: number;
  rows?: number;
  offsetU?: number;
  offsetV?: number;
}

/** Tile a source field over a new field. */
export function repeatField2D(
  source: Field2D,
  width: number,
  height: number,
  options: RepeatField2DOptions = {},
): Field2D {
  const cols = Math.max(1, options.columns ?? 2);
  const rows = Math.max(1, options.rows ?? cols);
  const offsetU = options.offsetU ?? 0;
  const offsetV = options.offsetV ?? 0;
  return generateField2D(width, height, (u, v) =>
    sampleField2DUV(source, frac(u * cols + offsetU), frac(v * rows + offsetV)),
  );
}

export interface CellsField2DOptions {
  columns?: number;
  rows?: number;
  seed?: number;
  /** id = random value per cell; edge = border mask; center = radial center falloff. */
  mode?: "id" | "edge" | "center";
  edgeWidth?: number;
}

function hashCell(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** Cell partition field for IDs, panel borders, tiles, scales and fabric blocks. */
export function cellsField2D(width: number, height: number, options: CellsField2DOptions = {}): Field2D {
  const cols = Math.max(1, options.columns ?? 4);
  const rows = Math.max(1, options.rows ?? cols);
  const seed = options.seed ?? 0;
  const mode = options.mode ?? "id";
  const edgeWidth = clamp(options.edgeWidth ?? 0.25, 0, 0.49);
  return generateField2D(width, height, (u, v) => {
    const x = u * cols;
    const y = v * rows;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const fx = frac(x);
    const fy = frac(y);
    if (mode === "id") return hashCell(cx, cy, seed);
    if (mode === "edge") {
      const d = Math.min(fx, 1 - fx, fy, 1 - fy);
      return 1 - smoothstep(edgeWidth * 0.5, edgeWidth, d);
    }
    const dx = fx - 0.5;
    const dy = fy - 0.5;
    return 1 - clamp(Math.hypot(dx, dy) / 0.70710678, 0, 1);
  });
}

export interface WeaveField2DOptions {
  columns?: number;
  rows?: number;
  /** Fractional width of each strand within one cell. */
  strandWidth?: number;
  /** Soft edge width around each strand. */
  softness?: number;
  /** How much the under-strand is visually suppressed at intersections. */
  underScale?: number;
  /** Per-column / per-row width jitter. */
  jitter?: number;
  seed?: number;
}

/**
 * Basket-weave mask / relief field. Strands run across the whole field in both
 * directions; each cell alternates which strand sits "on top" so the weave
 * reads like cloth, wicker or braided strips.
 */
export function weaveField2D(width: number, height: number, options: WeaveField2DOptions = {}): Field2D {
  const cols = Math.max(1, options.columns ?? 8);
  const rows = Math.max(1, options.rows ?? cols);
  const strandWidth = clamp(options.strandWidth ?? 0.34, 0.05, 0.48);
  const softness = clamp(options.softness ?? 0.08, 0, 0.49);
  const underScale = clamp(options.underScale ?? 0.65, 0, 1);
  const jitter = clamp(options.jitter ?? 0.08, 0, 0.45);
  const seed = options.seed ?? 0;

  const columnScale = new Float32Array(cols);
  const rowScale = new Float32Array(rows);
  for (let x = 0; x < cols; x++) columnScale[x] = 0.92 + (hashCell(x, 17, seed) - 0.5) * jitter;
  for (let y = 0; y < rows; y++) rowScale[y] = 0.92 + (hashCell(23, y, seed) - 0.5) * jitter;

  return generateField2D(width, height, (u, v) => {
    const gx = u * cols;
    const gy = v * rows;
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    const fu = frac(gx);
    const fv = frac(gy);

    const wU = clamp(strandWidth * columnScale[cx % cols]!, 0.08, 0.48);
    const wV = clamp(strandWidth * rowScale[cy % rows]!, 0.08, 0.48);
    const vert = 1 - smoothstep(wU - softness, wU + softness, Math.abs(fu - 0.5));
    const horiz = 1 - smoothstep(wV - softness, wV + softness, Math.abs(fv - 0.5));
    const overVertical = ((cx + cy) & 1) === 0;
    const top = overVertical ? vert : horiz;
    const under = overVertical ? horiz : vert;
    return clamp(Math.max(top, under * underScale), 0, 1);
  });
}

export type Stamp2D = (x: number, y: number) => number;

export interface CircleStamp2DOptions {
  radius?: number;
  softness?: number;
}

export function circleStamp2D(options: CircleStamp2DOptions = {}): Stamp2D {
  const radius = options.radius ?? 1;
  const softness = options.softness ?? 0.1;
  return (x, y) => {
    const d = Math.hypot(x, y);
    if (softness <= 0) return d <= radius ? 1 : 0;
    return 1 - smoothstep(radius - softness, radius, d);
  };
}

export interface BoxStamp2DOptions {
  width?: number;
  height?: number;
  softness?: number;
}

export function boxStamp2D(options: BoxStamp2DOptions = {}): Stamp2D {
  const hx = (options.width ?? 2) * 0.5;
  const hy = (options.height ?? 2) * 0.5;
  const softness = options.softness ?? 0.1;
  return (x, y) => {
    const dx = Math.abs(x) - hx;
    const dy = Math.abs(y) - hy;
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    const inside = Math.max(dx, dy);
    const sdf = outside + Math.min(inside, 0);
    if (softness <= 0) return sdf <= 0 ? 1 : 0;
    return 1 - smoothstep(-softness, 0, sdf);
  };
}

export interface BomberField2DOptions {
  count?: number;
  seed?: number;
  /** Diameter as fraction of the smaller image dimension. */
  size?: [number, number] | number;
  rotationJitter?: number;
  mode?: "max" | "add";
  clampOutput?: boolean;
}

/** Randomly stamp a small shape into a field; deterministic from seed. */
export function bomberField2D(
  width: number,
  height: number,
  stamp: Stamp2D = circleStamp2D(),
  options: BomberField2DOptions = {},
): Field2D {
  const out = makeField2D(width, height);
  const rng = makeRng(options.seed ?? 0);
  const count = Math.max(0, Math.floor(options.count ?? 16));
  const sizeOpt = options.size ?? [0.08, 0.16];
  const sizeRange = typeof sizeOpt === "number" ? [sizeOpt, sizeOpt] as [number, number] : sizeOpt;
  const baseDim = Math.min(out.width, out.height);
  const mode = options.mode ?? "max";

  for (let n = 0; n < count; n++) {
    const cx = rng.range(0, out.width - 1);
    const cy = rng.range(0, out.height - 1);
    const radius = rng.range(sizeRange[0], sizeRange[1]) * baseDim * 0.5;
    const rot = rng.range(-1, 1) * (options.rotationJitter ?? Math.PI);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(out.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(out.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - cx) / Math.max(1e-6, radius);
        const dy = (y - cy) / Math.max(1e-6, radius);
        const lx = dx * c - dy * s;
        const ly = dx * s + dy * c;
        const v = stamp(lx, ly);
        const i = y * out.width + x;
        out.data[i] = mode === "add" ? out.data[i]! + v : Math.max(out.data[i]!, v);
      }
    }
  }

  if (options.clampOutput ?? true) {
    for (let i = 0; i < out.data.length; i++) out.data[i] = clamp(out.data[i]!, 0, 1);
  }
  return out;
}
