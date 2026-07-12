import type { Mesh } from "../geometry/mesh.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";

export interface UdimTileUsage {
  readonly u: number;
  readonly v: number;
  readonly udim: number;
  readonly triangles: readonly number[];
}

export interface UdimLayout {
  readonly tiles: readonly UdimTileUsage[];
  readonly crossTileTriangles: readonly number[];
  readonly invalidTriangles: readonly number[];
}

/** Inspect mesh UVs without moving them. UDIM 1001 maps to tile (0,0). */
export function analyzeUdimLayout(mesh: Mesh): UdimLayout {
  const tiles = new Map<string, { u: number; v: number; triangles: number[] }>();
  const crossTileTriangles: number[] = [];
  const invalidTriangles: number[] = [];
  for (let triangle = 0; triangle < mesh.indices.length / 3; triangle++) {
    const ids = [mesh.indices[triangle * 3]!, mesh.indices[triangle * 3 + 1]!, mesh.indices[triangle * 3 + 2]!];
    const coordinates = ids.map((id) => mesh.uvs[id]!);
    if (coordinates.some((uv) => !Number.isFinite(uv.x) || !Number.isFinite(uv.y) || uv.x < 0 || uv.y < 0)) {
      invalidTriangles.push(triangle);
      continue;
    }
    const occupied = new Set(coordinates.map((uv) => `${Math.floor(uv.x)},${Math.floor(uv.y)}`));
    if (occupied.size > 1) crossTileTriangles.push(triangle);
    const centerU = Math.floor(coordinates.reduce((sum, uv) => sum + uv.x, 0) / 3);
    const centerV = Math.floor(coordinates.reduce((sum, uv) => sum + uv.y, 0) / 3);
    const key = `${centerU},${centerV}`;
    const entry = tiles.get(key) ?? { u: centerU, v: centerV, triangles: [] };
    entry.triangles.push(triangle);
    tiles.set(key, entry);
  }
  return {
    tiles: [...tiles.values()]
      .sort((left, right) => left.v - right.v || left.u - right.u)
      .map((entry) => ({ ...entry, udim: 1001 + entry.u + entry.v * 10 })),
    crossTileTriangles,
    invalidTriangles,
  };
}

export interface VirtualTexturePageOptions {
  readonly pageSize?: number;
  readonly border?: number;
  readonly worldPageSize?: number;
  readonly channels?: number;
}

export interface VirtualTexturePage {
  readonly pageX: number;
  readonly pageY: number;
  readonly border: number;
  readonly worldBounds: readonly [number, number, number, number];
  readonly texture: TextureBuffer;
}

/** Bake a page from global coordinates; adjacent page borders sample identically. */
export function bakeVirtualTexturePage(
  pageX: number,
  pageY: number,
  field: (worldU: number, worldV: number) => number | readonly number[],
  options: VirtualTexturePageOptions = {},
): VirtualTexturePage {
  const pageSize = positiveInt(options.pageSize ?? 128, "pageSize");
  const border = Math.max(0, Math.floor(options.border ?? 2));
  const worldPageSize = Math.max(Number.EPSILON, options.worldPageSize ?? 1);
  const channels = positiveInt(options.channels ?? 1, "channels");
  const size = pageSize + border * 2;
  const texture = makeTexture(size, size, channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const worldU = (pageX + (x - border + 0.5) / pageSize) * worldPageSize;
      const worldV = (pageY + (y - border + 0.5) / pageSize) * worldPageSize;
      const value = field(worldU, worldV);
      const values = typeof value === "number" ? [value] : value;
      for (let channel = 0; channel < channels; channel++) {
        texture.data[(y * size + x) * channels + channel] = values[channel] ?? values[0] ?? 0;
      }
    }
  }
  return {
    pageX,
    pageY,
    border,
    worldBounds: [pageX * worldPageSize, pageY * worldPageSize, (pageX + 1) * worldPageSize, (pageY + 1) * worldPageSize],
    texture,
  };
}

export interface PageContinuityReport {
  readonly maximumError: number;
  readonly meanError: number;
  readonly samples: number;
}

export function compareVirtualTextureBorders(
  first: VirtualTexturePage,
  second: VirtualTexturePage,
): PageContinuityReport {
  const horizontal = second.pageX === first.pageX + 1 && second.pageY === first.pageY;
  const vertical = second.pageY === first.pageY + 1 && second.pageX === first.pageX;
  if (!horizontal && !vertical) throw new Error("virtual texture pages must be direct right or bottom neighbors");
  if (
    first.texture.channels !== second.texture.channels
    || first.texture.width !== second.texture.width
    || first.texture.height !== second.texture.height
    || first.border !== second.border
  ) throw new Error("virtual texture pages must share shape and border");
  const border = first.border;
  if (border === 0) return { maximumError: 0, meanError: 0, samples: 0 };
  const pageSize = first.texture.width - border * 2;
  let maximumError = 0;
  let totalError = 0;
  let samples = 0;
  for (let offset = 0; offset < pageSize; offset++) {
    for (let depth = 0; depth < border; depth++) {
      for (let channel = 0; channel < first.texture.channels; channel++) {
        const firstX = horizontal ? border + pageSize + depth : border + offset;
        const firstY = horizontal ? border + offset : border + pageSize + depth;
        const secondX = horizontal ? border + depth : border + offset;
        const secondY = horizontal ? border + offset : border + depth;
        const a = first.texture.data[(firstY * first.texture.width + firstX) * first.texture.channels + channel]!;
        const b = second.texture.data[(secondY * second.texture.width + secondX) * second.texture.channels + channel]!;
        const error = Math.abs(a - b);
        maximumError = Math.max(maximumError, error);
        totalError += error;
        samples++;
      }
    }
  }
  return { maximumError, meanError: samples === 0 ? 0 : totalError / samples, samples };
}

/**
 * Continuous stochastic tiling. Four seeded periodic samples blend across a
 * world-space lattice, hiding source repetition without block seams.
 */
export function sampleNoRepeat(
  source: TextureBuffer,
  worldU: number,
  worldV: number,
  options: { readonly scale?: number; readonly seed?: number } = {},
): number[] {
  const scale = Math.max(Number.EPSILON, options.scale ?? 1);
  const u = worldU * scale;
  const v = worldV * scale;
  const cellX = Math.floor(u);
  const cellY = Math.floor(v);
  const localU = smooth(u - cellX);
  const localV = smooth(v - cellY);
  const output = new Array<number>(source.channels).fill(0);
  for (let offsetY = 0; offsetY <= 1; offsetY++) {
    for (let offsetX = 0; offsetX <= 1; offsetX++) {
      const x = cellX + offsetX;
      const y = cellY + offsetY;
      const hash = hash2(x, y, options.seed ?? 0);
      const shiftU = ((hash & 0xffff) / 0x10000);
      const shiftV = (((hash >>> 16) & 0xffff) / 0x10000);
      const weightU = offsetX === 0 ? 1 - localU : localU;
      const weightV = offsetY === 0 ? 1 - localV : localV;
      const weight = weightU * weightV;
      const sampled = sampleBilinearWrapped(source, u + shiftU, v + shiftV);
      for (let channel = 0; channel < source.channels; channel++) {
        output[channel] = output[channel]! + sampled[channel]! * weight;
      }
    }
  }
  return output;
}

function sampleBilinearWrapped(texture: TextureBuffer, u: number, v: number): number[] {
  const x = repeat(u) * texture.width - 0.5;
  const y = repeat(v) * texture.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const output = new Array<number>(texture.channels);
  for (let channel = 0; channel < texture.channels; channel++) {
    const a = wrappedSample(texture, x0, y0, channel);
    const b = wrappedSample(texture, x0 + 1, y0, channel);
    const c = wrappedSample(texture, x0, y0 + 1, channel);
    const d = wrappedSample(texture, x0 + 1, y0 + 1, channel);
    output[channel] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }
  return output;
}

function wrappedSample(texture: TextureBuffer, x: number, y: number, channel: number): number {
  const wrappedX = ((x % texture.width) + texture.width) % texture.width;
  const wrappedY = ((y % texture.height) + texture.height) % texture.height;
  return texture.data[(wrappedY * texture.width + wrappedX) * texture.channels + channel]!;
}

function hash2(x: number, y: number, seed: number): number {
  let hash = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ Math.imul(seed, 0x2c1b3c6d);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function repeat(value: number): number {
  return ((value % 1) + 1) % 1;
}

function positiveInt(value: number, name: string): number {
  const result = Math.floor(value);
  if (!Number.isFinite(value) || result < 1) throw new Error(`${name} must be a positive integer`);
  return result;
}
