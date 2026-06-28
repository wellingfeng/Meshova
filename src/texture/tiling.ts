/**
 * Tiling & layout ops (P12): the heavier nodes that need connectivity or
 * instancing — Flood Fill (connected-component labeling + random recolor),
 * Make it Tile (seamless wrapping), and Tile Sampler (instance scatter of a
 * shape mask). Mirrors Substance Designer's Flood Fill / Make it Tile /
 * Tile Sampler. Self-written from public algorithm knowledge.
 *
 * Convention: operate on TextureBuffer (row-major, see buffer.ts). All return
 * new buffers; inputs are never mutated.
 */
import {
  makeTexture,
  sample,
  type TextureBuffer,
} from "./buffer.js";
import { makeRng } from "../random/prng.js";
import { clamp, smoothstep } from "../math/scalar.js";

export interface FloodFillOptions {
  /** Threshold above which a pixel counts as "shape" (foreground). */
  threshold?: number;
  /** 8-connectivity (diagonals) when true, else 4-connectivity. */
  diagonal?: boolean;
}

/**
 * Label connected components of a binary-ish mask (channel 0). Returns a
 * Int32Array of labels (0 = background, 1..N = component id) plus the count.
 * Two-pass scanline union-find — the backbone of Flood Fill. Background is any
 * pixel <= threshold.
 */
export function labelComponents(
  mask: TextureBuffer,
  opts: FloodFillOptions = {},
): { labels: Int32Array; count: number; width: number; height: number } {
  const threshold = opts.threshold ?? 0.5;
  const diagonal = opts.diagonal ?? false;
  const { width: w, height: h } = mask;
  const labels = new Int32Array(w * h);
  const parent: number[] = [0]; // union-find; index 0 unused sentinel
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[a] !== r) {
      const next = parent[a]!;
      parent[a] = r;
      a = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  let nextLabel = 1;
  const fg = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && sample(mask, x, y, 0) > threshold;

  // first pass: provisional labels + record equivalences
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!fg(x, y)) continue;
      const neighbors: number[] = [];
      if (fg(x - 1, y)) neighbors.push(labels[y * w + (x - 1)]!);
      if (fg(x, y - 1)) neighbors.push(labels[(y - 1) * w + x]!);
      if (diagonal) {
        if (fg(x - 1, y - 1)) neighbors.push(labels[(y - 1) * w + (x - 1)]!);
        if (fg(x + 1, y - 1)) neighbors.push(labels[(y - 1) * w + (x + 1)]!);
      }
      if (neighbors.length === 0) {
        labels[y * w + x] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      } else {
        const m = Math.min(...neighbors);
        labels[y * w + x] = m;
        for (const n of neighbors) union(m, n);
      }
    }
  }
  // second pass: flatten to root + compact ids
  const remap = new Map<number, number>();
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 0) continue;
    const root = find(labels[i]!);
    let id = remap.get(root);
    if (id === undefined) {
      id = ++count;
      remap.set(root, id);
    }
    labels[i] = id;
  }
  return { labels, count, width: w, height: h };
}
/**
 * Flood Fill to Random Grayscale: assign each connected component a stable
 * random value in [0,1] — SD's Flood Fill to Random Grayscale, the key to
 * per-tile/per-brick variation. Background stays 0.
 */
export function floodFillRandom(
  mask: TextureBuffer,
  opts: FloodFillOptions & { seed?: number } = {},
): TextureBuffer {
  const { labels, count, width: w, height: h } = labelComponents(mask, opts);
  const seed = opts.seed ?? 0;
  // one deterministic value per component
  const values = new Float32Array(count + 1);
  for (let i = 1; i <= count; i++) {
    const hsh = ((i * 2654435761) ^ (seed * 40503)) >>> 0;
    values[i] = makeRng(hsh).next();
  }
  const out = makeTexture(w, h, 1);
  for (let i = 0; i < labels.length; i++) out.data[i] = values[labels[i]!]!;
  return out;
}

/**
 * Flood Fill to BBox Gradient: within each component, output a normalized
 * local gradient (0..1 across the component's bounding box along U) — SD's
 * Flood Fill to Gradient, useful for per-instance UV / directional shading.
 */
export function floodFillGradient(
  mask: TextureBuffer,
  opts: FloodFillOptions & { axis?: "u" | "v" } = {},
): TextureBuffer {
  const { labels, count, width: w, height: h } = labelComponents(mask, opts);
  const axis = opts.axis ?? "u";
  // compute bbox per component
  const minA = new Float32Array(count + 1).fill(Infinity);
  const maxA = new Float32Array(count + 1).fill(-Infinity);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x]!;
      if (l === 0) continue;
      const a = axis === "u" ? x : y;
      if (a < minA[l]!) minA[l] = a;
      if (a > maxA[l]!) maxA[l] = a;
    }
  }
  const out = makeTexture(w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x]!;
      if (l === 0) continue;
      const a = axis === "u" ? x : y;
      const span = maxA[l]! - minA[l]! || 1;
      out.data[y * w + x] = (a - minA[l]!) / span;
    }
  }
  return out;
}
export interface MakeTileOptions {
  /** Blend band width as a fraction of size (0..0.5). */
  band?: number;
}

/**
 * Make it Tile: cross-fade the buffer with its half-offset self so opposite
 * edges match, removing seams — SD's Make it Tile Patch (offset+blend variant).
 * Works per channel. A mask favors the center so detail survives.
 */
export function makeTile(tex: TextureBuffer, opts: MakeTileOptions = {}): TextureBuffer {
  const band = clamp(opts.band ?? 0.25, 0.01, 0.5);
  const { width: w, height: h, channels: ch } = tex;
  const out = makeTexture(w, h, ch);
  // weight is low near edges (use shifted copy), high in center (use original)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    // distance to nearest vertical edge, normalized
    const dvy = Math.min(v, 1 - v) / band;
    const wy = smoothstep(0, 1, clamp(dvy, 0, 1));
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const dvx = Math.min(u, 1 - u) / band;
      const wx = smoothstep(0, 1, clamp(dvx, 0, 1));
      const weight = wx * wy; // 1 center, 0 at edges
      const sx = (x + (w >> 1)) % w;
      const sy = (y + (h >> 1)) % h;
      for (let c = 0; c < ch; c++) {
        const orig = sample(tex, x, y, c);
        const shifted = sample(tex, sx, sy, c);
        out.data[(y * w + x) * ch + c] = orig * weight + shifted * (1 - weight);
      }
    }
  }
  return out;
}

export interface TileSamplerOptions {
  /** Instances per row/column. */
  count?: number;
  /** Random position jitter in cell fraction (0..0.5). */
  jitter?: number;
  /** Random scale range [min,max] applied to each instance. */
  scaleRange?: [number, number];
  /** Random rotation amount in radians (0 = none). */
  rotation?: number;
  /** Random per-instance value spread written to output brightness (0..1). */
  valueSpread?: number;
  seed?: number;
}

/**
 * Tile Sampler: scatter a shape mask function across a grid with per-instance
 * random position, scale, rotation and brightness, accumulating the max —
 * SD's Tile Sampler. `shapeFn(u,v)` is a centered [0,1] mask (e.g. patterns3
 * shape/star/dots). Returns a single-channel buffer.
 */
export function tileSampler(
  size: number,
  shapeFn: (u: number, v: number) => number,
  opts: TileSamplerOptions = {},
): TextureBuffer {
  const count = Math.max(1, Math.floor(opts.count ?? 6));
  const jitter = clamp(opts.jitter ?? 0.2, 0, 0.5);
  const scaleRange = opts.scaleRange ?? [0.8, 1.2];
  const rotation = opts.rotation ?? 0;
  const valueSpread = clamp(opts.valueSpread ?? 0, 0, 1);
  const seed = opts.seed ?? 0;
  const out = makeTexture(size, size, 1);

  // precompute per-instance transforms
  interface Inst { cx: number; cy: number; s: number; ang: number; val: number; }
  const insts: Inst[] = [];
  for (let gy = 0; gy < count; gy++) {
    for (let gx = 0; gx < count; gx++) {
      const h = ((gx * 73856093) ^ (gy * 19349663) ^ (seed * 83492791)) >>> 0;
      const rng = makeRng(h);
      const cx = (gx + 0.5) / count + (rng.next() - 0.5) * jitter / count;
      const cy = (gy + 0.5) / count + (rng.next() - 0.5) * jitter / count;
      const s = scaleRange[0] + rng.next() * (scaleRange[1] - scaleRange[0]);
      const ang = (rng.next() - 0.5) * 2 * rotation;
      const val = 1 - rng.next() * valueSpread;
      insts.push({ cx, cy, s, ang, val });
    }
  }

  const cell = 1 / count;
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let acc = 0;
      // only instances within ~1.5 cells can affect this pixel
      for (const it of insts) {
        let du = u - it.cx;
        let dv = v - it.cy;
        if (Math.abs(du) > cell * 1.5 || Math.abs(dv) > cell * 1.5) continue;
        // inverse transform into instance local space, mapped to [0,1] mask uv
        const inv = 1 / (it.s * cell);
        const ca = Math.cos(-it.ang);
        const sa = Math.sin(-it.ang);
        const lu = (du * ca - dv * sa) * inv + 0.5;
        const lv = (du * sa + dv * ca) * inv + 0.5;
        if (lu < 0 || lu > 1 || lv < 0 || lv > 1) continue;
        const m = shapeFn(lu, lv) * it.val;
        if (m > acc) acc = m;
      }
      out.data[y * size + x] = clamp(acc, 0, 1);
    }
  }
  return out;
}

