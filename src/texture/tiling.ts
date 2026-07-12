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

export interface FloodFillHeightOptions extends FloodFillOptions {
  seed?: number;
  base?: number;
  variation?: number;
}

/** Assign one deterministic height to each connected component. */
export function floodFillHeight(
  mask: TextureBuffer,
  opts: FloodFillHeightOptions = {},
): TextureBuffer {
  const { labels, count, width, height } = labelComponents(mask, opts);
  const seed = opts.seed ?? 0;
  const base = clamp(opts.base ?? 0.5, 0, 1);
  const variation = clamp(opts.variation ?? 0.5, 0, 1);
  const values = new Float32Array(count + 1);
  for (let component = 1; component <= count; component++) {
    const hash = ((component * 2654435761) ^ (seed * 40503)) >>> 0;
    const random = makeRng(hash).next() * 2 - 1;
    values[component] = clamp(base + random * variation, 0, 1);
  }
  const output = makeTexture(width, height, 1);
  for (let index = 0; index < labels.length; index++) {
    output.data[index] = values[labels[index]!]!;
  }
  return output;
}

export interface FloodFillSlopeOptions extends FloodFillOptions {
  seed?: number;
  angle?: number;
  angleVariation?: number;
}

/** Build an independently oriented 0..1 planar slope inside every component. */
export function floodFillSlope(
  mask: TextureBuffer,
  opts: FloodFillSlopeOptions = {},
): TextureBuffer {
  const { labels, count, width, height } = labelComponents(mask, opts);
  const minimumX = new Float32Array(count + 1).fill(Infinity);
  const maximumX = new Float32Array(count + 1).fill(-Infinity);
  const minimumY = new Float32Array(count + 1).fill(Infinity);
  const maximumY = new Float32Array(count + 1).fill(-Infinity);
  for (let yCoord = 0; yCoord < height; yCoord++) {
    for (let xCoord = 0; xCoord < width; xCoord++) {
      const component = labels[yCoord * width + xCoord]!;
      if (component === 0) continue;
      minimumX[component] = Math.min(minimumX[component]!, xCoord);
      maximumX[component] = Math.max(maximumX[component]!, xCoord);
      minimumY[component] = Math.min(minimumY[component]!, yCoord);
      maximumY[component] = Math.max(maximumY[component]!, yCoord);
    }
  }

  const baseAngle = opts.angle ?? 0;
  const angleVariation = Math.max(0, opts.angleVariation ?? Math.PI);
  const seed = opts.seed ?? 0;
  const angles = new Float32Array(count + 1);
  for (let component = 1; component <= count; component++) {
    const hash = ((component * 2246822519) ^ (seed * 3266489917)) >>> 0;
    angles[component] = baseAngle + (makeRng(hash).next() * 2 - 1) * angleVariation;
  }

  const output = makeTexture(width, height, 1);
  for (let yCoord = 0; yCoord < height; yCoord++) {
    for (let xCoord = 0; xCoord < width; xCoord++) {
      const index = yCoord * width + xCoord;
      const component = labels[index]!;
      if (component === 0) continue;
      const centerX = (minimumX[component]! + maximumX[component]!) * 0.5;
      const centerY = (minimumY[component]! + maximumY[component]!) * 0.5;
      const halfWidth = Math.max(0.5, (maximumX[component]! - minimumX[component]!) * 0.5);
      const halfHeight = Math.max(0.5, (maximumY[component]! - minimumY[component]!) * 0.5);
      const angle = angles[component]!;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const extent = Math.abs(directionX) * halfWidth + Math.abs(directionY) * halfHeight;
      const projection = (xCoord - centerX) * directionX + (yCoord - centerY) * directionY;
      output.data[index] = clamp(projection / Math.max(1, extent) * 0.5 + 0.5, 0, 1);
    }
  }
  return output;
}

export interface FloodFillSelectOptions extends FloodFillOptions {
  seed?: number;
  probability?: number;
}

/** Select whole connected components with a seeded probability. */
export function floodFillSelect(
  mask: TextureBuffer,
  opts: FloodFillSelectOptions = {},
): TextureBuffer {
  const { labels, count, width, height } = labelComponents(mask, opts);
  const seed = opts.seed ?? 0;
  const probability = clamp(opts.probability ?? 0.5, 0, 1);
  const selected = new Uint8Array(count + 1);
  for (let component = 1; component <= count; component++) {
    const hash = ((component * 3266489917) ^ (seed * 668265263)) >>> 0;
    selected[component] = makeRng(hash).next() < probability ? 1 : 0;
  }
  const output = makeTexture(width, height, 1);
  for (let index = 0; index < labels.length; index++) {
    output.data[index] = selected[labels[index]!]!;
  }
  return output;
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
  /** Optional independent column count. Overrides count. */
  countX?: number;
  /** Optional independent row count. Overrides count. */
  countY?: number;
  /** Fraction of candidate cells populated. */
  density?: number;
  /** Random position jitter in cell fraction (0..0.5). */
  jitter?: number;
  /** Random scale range [min,max] applied to each instance. */
  scaleRange?: [number, number];
  /** Random rotation amount in radians (0 = none). */
  rotation?: number;
  /** Random per-instance value spread written to output brightness (0..1). */
  valueSpread?: number;
  /** Minimum center separation in cell units. 0 disables collision rejection. */
  collision?: number;
  /** Controls where instances may spawn, sampled at each candidate center. */
  mask?: TextureBuffer | ((u: number, v: number) => number);
  /** Max preserves silhouettes; add builds overlapping piles. */
  blend?: "max" | "add";
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
  const countX = Math.max(1, Math.floor(opts.countX ?? count));
  const countY = Math.max(1, Math.floor(opts.countY ?? count));
  const density = clamp(opts.density ?? 1, 0, 1);
  const jitter = clamp(opts.jitter ?? 0.2, 0, 0.5);
  const scaleRange = opts.scaleRange ?? [0.8, 1.2];
  const rotation = opts.rotation ?? 0;
  const valueSpread = clamp(opts.valueSpread ?? 0, 0, 1);
  const collision = Math.max(0, opts.collision ?? 0);
  const blend = opts.blend ?? "max";
  const seed = opts.seed ?? 0;
  const out = makeTexture(size, size, 1);

  const sampleMask = (u: number, v: number): number => {
    if (!opts.mask) return 1;
    if (typeof opts.mask === "function") return clamp(opts.mask(u, v), 0, 1);
    const x = Math.min(opts.mask.width - 1, Math.max(0, Math.floor(u * opts.mask.width)));
    const y = Math.min(opts.mask.height - 1, Math.max(0, Math.floor((1 - v) * opts.mask.height)));
    return clamp(sample(opts.mask, x, y), 0, 1);
  };

  // precompute per-instance transforms
  interface Inst { cx: number; cy: number; s: number; ang: number; val: number; }
  const insts: Inst[] = [];
  const cellX = 1 / countX;
  const cellY = 1 / countY;
  const cell = Math.min(cellX, cellY);
  for (let gy = 0; gy < countY; gy++) {
    for (let gx = 0; gx < countX; gx++) {
      const h = ((gx * 73856093) ^ (gy * 19349663) ^ (seed * 83492791)) >>> 0;
      const rng = makeRng(h);
      if (density < 1 && rng.next() > density) continue;
      const cx = (gx + 0.5) / countX + (rng.next() - 0.5) * jitter * cellX;
      const cy = (gy + 0.5) / countY + (rng.next() - 0.5) * jitter * cellY;
      if (opts.mask && rng.next() > sampleMask(cx, cy)) continue;
      const s = scaleRange[0] + rng.next() * (scaleRange[1] - scaleRange[0]);
      const ang = (rng.next() - 0.5) * 2 * rotation;
      const val = 1 - rng.next() * valueSpread;
      if (collision > 0 && insts.some((item) => Math.hypot(item.cx - cx, item.cy - cy) < collision * cell)) {
        continue;
      }
      insts.push({ cx, cy, s, ang, val });
    }
  }

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
        acc = blend === "add" ? acc + m : Math.max(acc, m);
      }
      out.data[y * size + x] = clamp(acc, 0, 1);
    }
  }
  return out;
}

export interface WangTileSource {
  readonly texture: TextureBuffer;
  readonly north: number;
  readonly east: number;
  readonly south: number;
  readonly west: number;
  readonly weight?: number;
}

export interface WangTileOptions {
  tilesX?: number;
  tilesY?: number;
  seed?: number;
  allowRotations?: boolean;
  colorCorrection?: boolean;
  colorJitter?: number;
}

export interface WangTilePlacement {
  readonly tile: number;
  readonly quarterTurns: number;
  readonly north: number;
  readonly east: number;
  readonly south: number;
  readonly west: number;
}

export interface WangTileResult {
  readonly texture: TextureBuffer;
  readonly placements: ReadonlyArray<WangTilePlacement>;
  readonly tilesX: number;
  readonly tilesY: number;
}

export function wangTileTexture(
  sources: readonly WangTileSource[],
  options: WangTileOptions = {},
): WangTileResult {
  if (sources.length === 0) throw new Error("Wang tile sources must not be empty");
  const first = sources[0]!.texture;
  const allowRotations = options.allowRotations ?? true;
  if (allowRotations && first.width !== first.height) {
    throw new Error("rotated Wang tiles must be square");
  }
  for (const source of sources) {
    if (
      source.texture.width !== first.width
      || source.texture.height !== first.height
      || source.texture.channels !== first.channels
    ) {
      throw new Error("Wang tile sources must share dimensions and channels");
    }
  }
  const tilesX = Math.max(1, Math.floor(options.tilesX ?? 4));
  const tilesY = Math.max(1, Math.floor(options.tilesY ?? tilesX));
  const rotations = allowRotations ? 4 : 1;
  const candidates = sources.flatMap((source, tile) => Array.from({ length: rotations }, (_, quarterTurns) => {
    const edges = rotateEdges([source.north, source.east, source.south, source.west], quarterTurns);
    return {
      tile,
      quarterTurns,
      north: edges[0],
      east: edges[1],
      south: edges[2],
      west: edges[3],
      weight: Math.max(0, source.weight ?? 1),
    } satisfies WangTilePlacement & { weight: number };
  }));
  const rng = makeRng(options.seed ?? 0);
  const placements: WangTilePlacement[] = [];
  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const north = tileY > 0 ? placements[(tileY - 1) * tilesX + tileX]!.south : undefined;
      const west = tileX > 0 ? placements[tileY * tilesX + tileX - 1]!.east : undefined;
      const matches = candidates.filter((candidate) => (
        (north === undefined || candidate.north === north)
        && (west === undefined || candidate.west === west)
      ));
      if (matches.length === 0) {
        throw new Error(`Wang tile set cannot satisfy cell ${tileX},${tileY}`);
      }
      placements.push(weightedChoice(matches, rng.next()));
    }
  }
  const output = makeTexture(first.width * tilesX, first.height * tilesY, first.channels);
  const means = sources.map((source) => textureMean(source.texture));
  const globalMean = means[0]!.map((_, channel) => (
    means.reduce((sum, mean) => sum + mean[channel]!, 0) / means.length
  ));
  const colorCorrection = options.colorCorrection ?? true;
  const colorJitter = clamp(options.colorJitter ?? 0.035, 0, 1);
  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const placement = placements[tileY * tilesX + tileX]!;
      const source = sources[placement.tile]!.texture;
      const mean = means[placement.tile]!;
      const jitterRng = makeRng(((options.seed ?? 0) * 83492791 ^ tileX * 73856093 ^ tileY * 19349663) >>> 0);
      const brightness = jitterRng.range(1 - colorJitter, 1 + colorJitter);
      for (let y = 0; y < first.height; y++) {
        for (let x = 0; x < first.width; x++) {
          const sourcePixel = rotatedPixel(x, y, first.width, first.height, placement.quarterTurns);
          for (let channel = 0; channel < first.channels; channel++) {
            const value = sample(source, sourcePixel.x, sourcePixel.y, channel);
            const corrected = colorCorrection ? value + globalMean[channel]! - mean[channel]! : value;
            const destination = (
              ((tileY * first.height + y) * output.width + tileX * first.width + x) * first.channels
              + channel
            );
            output.data[destination] = clamp(corrected * brightness, 0, 1);
          }
        }
      }
    }
  }
  return { texture: output, placements, tilesX, tilesY };
}

function rotateEdges(
  edges: readonly [number, number, number, number],
  quarterTurns: number,
): [number, number, number, number] {
  const turns = ((quarterTurns % 4) + 4) % 4;
  return [0, 1, 2, 3].map((edge) => edges[(edge - turns + 4) % 4]!) as [number, number, number, number];
}

function rotatedPixel(
  x: number,
  y: number,
  width: number,
  height: number,
  quarterTurns: number,
): { x: number; y: number } {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 1) return { x: y, y: width - 1 - x };
  if (turns === 2) return { x: width - 1 - x, y: height - 1 - y };
  if (turns === 3) return { x: height - 1 - y, y: x };
  return { x, y };
}

function textureMean(texture: TextureBuffer): number[] {
  const mean = Array.from({ length: texture.channels }, () => 0);
  const pixelCount = texture.width * texture.height;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    for (let channel = 0; channel < texture.channels; channel++) {
      mean[channel] = mean[channel]! + texture.data[pixel * texture.channels + channel]!;
    }
  }
  return mean.map((value) => value / pixelCount);
}

function weightedChoice<T extends { weight: number }>(values: readonly T[], random: number): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  if (total <= 0) return values[Math.min(values.length - 1, Math.floor(random * values.length))]!;
  let cursor = random * total;
  for (const value of values) {
    cursor -= value.weight;
    if (cursor <= 0) return value;
  }
  return values[values.length - 1]!;
}
