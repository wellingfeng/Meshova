/**
 * Sebastian Lague-style landmass terrain pipeline, rewritten for Meshova.
 *
 * Shape:
 *   noise map -> optional island falloff -> terrain-type colour map -> mesh
 *   -> optional LOD/chunks.
 *
 * This is not Unity code ported line-for-line. It keeps the teaching-series
 * architecture but uses Meshova Field2D/Mesh primitives and deterministic TS.
 */
import {
  field2DStats,
  makeField2D,
  normalizeField2D,
  sampleField2D,
  type Field2D,
} from "../field/index.js";
import { makeMesh, recomputeNormals, type Mesh } from "../geometry/index.js";
import { clamp, lerp } from "../math/scalar.js";
import { vec2 } from "../math/vec2.js";
import { cross, normalize, sub, vec3, type Vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import {
  erodeTerrainHeightfield,
  type TerrainErosionOptions,
} from "./heightfield.js";

export type LandmassNormalizeMode = "local" | "global";

export interface LandmassNoiseOptions {
  width?: number;
  height?: number;
  seed?: number;
  scale?: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  offsetX?: number;
  offsetY?: number;
  normalizeMode?: LandmassNormalizeMode;
}

export interface LandmassFalloffOptions {
  size?: number;
  /** Curve exponent. Higher = steeper coast. Default 3. */
  exponent?: number;
  /** Midpoint/contrast control. Higher = larger island interior. Default 2.2. */
  midpoint?: number;
}

export interface LandmassErosionOptions extends TerrainErosionOptions {
  /** Keep chunk-border samples unchanged so adjacent chunks remain seamless. Default true. */
  preserveEdges?: boolean;
}

export interface LandmassErosionMaps {
  wear: Field2D;
  deposition: Field2D;
  flow: Field2D;
}

export interface LandmassTerrainType {
  id: string;
  label?: string;
  /** Inclusive upper normalized height threshold. */
  height: number;
  color: [number, number, number];
}

export interface LandmassMapOptions extends LandmassNoiseOptions {
  terrainTypes?: LandmassTerrainType[];
  useFalloff?: boolean;
  falloff?: LandmassFalloffOptions;
  /** Optional hydraulic + thermal erosion pass. */
  erosion?: LandmassErosionOptions | false;
}

export interface LandmassMapData {
  heightMap: Field2D;
  falloffMap?: Field2D;
  erosionMaps?: LandmassErosionMaps;
  colorMap: number[];
  biomeIndex: Int32Array;
  terrainTypes: LandmassTerrainType[];
}

export type LandmassEdge = "north" | "east" | "south" | "west";

export type LandmassEdgeLODs = Partial<Record<LandmassEdge, number>>;

export interface LandmassMeshOptions {
  size?: number;
  heightMultiplier?: number;
  heightCurve?: (height: number) => number;
  lod?: number;
  flatShaded?: boolean;
  /** If omitted, mesh is centered around origin. If supplied, mesh starts here. */
  originX?: number;
  originZ?: number;
  /** Neighbour LOD per edge. Fine edges bend onto coarser neighbour segments. */
  edgeLODs?: LandmassEdgeLODs;
  /** Downward border extrusion hiding residual T-junctions. 0 disables skirts. */
  skirtDepth?: number;
}

export interface LandmassTerrainOptions extends LandmassMapOptions, LandmassMeshOptions {
}

export interface LandmassTerrainResult extends LandmassMapData {
  mesh: Mesh;
  colors: number[];
}

export interface LandmassLODLevel {
  /** Viewer distance at/above which this LOD becomes active. */
  distance: number;
  lod: number;
}

export interface LandmassChunkOptions extends LandmassTerrainOptions {
  chunkX?: number;
  chunkZ?: number;
  chunkSize?: number;
}

export interface LandmassChunk {
  chunkX: number;
  chunkZ: number;
  originX: number;
  originZ: number;
  size: number;
  data: LandmassTerrainResult;
}

export type LandmassChunkGenerator = (
  options: LandmassChunkOptions,
) => LandmassChunk | Promise<LandmassChunk>;

export interface LandmassChunkStreamerOptions extends LandmassChunkOptions {
  radius?: number;
  lodLevels?: LandmassLODLevel[];
  maxCachedChunks?: number;
  /** Replace with a Web Worker-backed generator in browser runtimes. */
  generateChunk?: LandmassChunkGenerator;
  /** Optional cooperative yield before uncached generation. */
  schedule?: () => Promise<void>;
}

interface LandmassChunkCacheEntry {
  promise: Promise<LandmassChunk>;
  lastUsed: number;
}

export const DEFAULT_LANDMASS_TERRAIN_TYPES: LandmassTerrainType[] = [
  { id: "water", label: "水体", height: 0.28, color: [0.12, 0.34, 0.62] },
  { id: "sand", label: "沙滩", height: 0.36, color: [0.74, 0.66, 0.43] },
  { id: "grass", label: "草地", height: 0.58, color: [0.25, 0.45, 0.18] },
  { id: "forest", label: "林地", height: 0.72, color: [0.16, 0.31, 0.12] },
  { id: "rock", label: "岩石", height: 0.88, color: [0.43, 0.42, 0.38] },
  { id: "snow", label: "雪线", height: 1, color: [0.86, 0.87, 0.82] },
];

export function generateLandmassNoiseMap(options: LandmassNoiseOptions = {}): Field2D {
  const width = Math.max(1, Math.round(options.width ?? 129));
  const height = Math.max(1, Math.round(options.height ?? width));
  const seed = Math.round(options.seed ?? 1) >>> 0;
  const scale = Math.max(0.0001, options.scale ?? 45);
  const octaves = Math.max(1, Math.round(options.octaves ?? 5));
  const persistence = clamp(options.persistence ?? 0.5, 0, 1);
  const lacunarity = Math.max(1, options.lacunarity ?? 2);
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const normalizeMode = options.normalizeMode ?? "local";
  const noise = makeNoise(seed);
  const rng = makeRng(seed + 0x9e3779b9);
  const octaveOffsets = Array.from({ length: octaves }, () => ({
    x: rng.range(-100000, 100000) + offsetX,
    y: rng.range(-100000, 100000) + offsetY,
  }));

  const out = makeField2D(width, height);
  let maxPossibleHeight = 0;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    maxPossibleHeight += amplitude;
    amplitude *= persistence;
  }

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      amplitude = 1;
      let frequency = 1;
      let noiseHeight = 0;
      for (let o = 0; o < octaves; o++) {
        const off = octaveOffsets[o]!;
        const sx = ((x - halfW + off.x) / scale) * frequency;
        const sy = ((y - halfH + off.y) / scale) * frequency;
        noiseHeight += noise.noise2(sx, sy) * amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      out.data[y * width + x] = normalizeMode === "global"
        ? clamp((noiseHeight + maxPossibleHeight) / (2 * maxPossibleHeight), 0, 1)
        : noiseHeight;
    }
  }

  return normalizeMode === "local" ? normalizeField2D(out) : out;
}

export function generateLandmassFalloffMap(options: LandmassFalloffOptions = {}): Field2D {
  const size = Math.max(1, Math.round(options.size ?? 129));
  const exponent = Math.max(0.001, options.exponent ?? 3);
  const midpoint = Math.max(0.001, options.midpoint ?? 2.2);
  const out = makeField2D(size, size);
  for (let y = 0; y < size; y++) {
    const v = size === 1 ? 0 : y / (size - 1) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = size === 1 ? 0 : x / (size - 1) * 2 - 1;
      const d = Math.max(Math.abs(u), Math.abs(v));
      out.data[y * size + x] = evaluateLandmassFalloff(d, exponent, midpoint);
    }
  }
  return out;
}

export function evaluateLandmassFalloff(value: number, exponent = 3, midpoint = 2.2): number {
  const v = clamp(value, 0, 1);
  const a = Math.pow(v, exponent);
  const b = Math.pow(midpoint - midpoint * v, exponent);
  return a / (a + b || 1);
}

export function applyLandmassFalloff(heightMap: Field2D, falloffMap: Field2D): Field2D {
  const out = makeField2D(heightMap.width, heightMap.height);
  for (let y = 0; y < heightMap.height; y++) {
    const fy = heightMap.height === 1
      ? 0
      : Math.round((y / (heightMap.height - 1)) * (falloffMap.height - 1));
    for (let x = 0; x < heightMap.width; x++) {
      const fx = heightMap.width === 1
        ? 0
        : Math.round((x / (heightMap.width - 1)) * (falloffMap.width - 1));
      const i = y * heightMap.width + x;
      out.data[i] = clamp(heightMap.data[i]! - sampleField2D(falloffMap, fx, fy), 0, 1);
    }
  }
  return out;
}

export function buildLandmassMap(options: LandmassMapOptions = {}): LandmassMapData {
  const width = Math.max(1, Math.round(options.width ?? 129));
  const height = Math.max(1, Math.round(options.height ?? width));
  let heightMap = generateLandmassNoiseMap({ ...options, width, height });
  let falloffMap: Field2D | undefined;
  if (options.useFalloff ?? true) {
    falloffMap = generateLandmassFalloffMap({ ...options.falloff, size: Math.max(width, height) });
    heightMap = applyLandmassFalloff(heightMap, falloffMap);
  }
  let erosionMaps: LandmassErosionMaps | undefined;
  if (options.erosion !== false && options.erosion !== undefined) {
    const sourceHeightMap = heightMap;
    const eroded = erodeTerrainHeightfield(sourceHeightMap, options.erosion);
    heightMap = clampLandmassHeightMap(eroded.height);
    if (options.erosion.preserveEdges ?? true) {
      heightMap = restoreLandmassEdges(heightMap, sourceHeightMap);
    }
    erosionMaps = {
      wear: eroded.wear,
      deposition: eroded.deposition,
      flow: eroded.flow,
    };
  }
  const terrainTypes = normalizeTerrainTypes(options.terrainTypes ?? DEFAULT_LANDMASS_TERRAIN_TYPES);
  const { colorMap, biomeIndex } = classifyLandmassTerrain(heightMap, terrainTypes);
  return {
    heightMap,
    ...(falloffMap ? { falloffMap } : {}),
    ...(erosionMaps ? { erosionMaps } : {}),
    colorMap,
    biomeIndex,
    terrainTypes,
  };
}

export function classifyLandmassTerrain(
  heightMap: Field2D,
  terrainTypes = DEFAULT_LANDMASS_TERRAIN_TYPES,
): { colorMap: number[]; biomeIndex: Int32Array } {
  const types = normalizeTerrainTypes(terrainTypes);
  const colorMap = new Array(heightMap.data.length * 3);
  const biomeIndex = new Int32Array(heightMap.data.length);
  for (let i = 0; i < heightMap.data.length; i++) {
    const h = clamp(heightMap.data[i]!, 0, 1);
    let chosen = types.length - 1;
    for (let t = 0; t < types.length; t++) {
      if (h <= types[t]!.height) {
        chosen = t;
        break;
      }
    }
    const c = types[chosen]!.color;
    biomeIndex[i] = chosen;
    colorMap[i * 3] = c[0];
    colorMap[i * 3 + 1] = c[1];
    colorMap[i * 3 + 2] = c[2];
  }
  return { colorMap, biomeIndex };
}

export function landmassHeightfieldToMesh(
  heightMap: Field2D,
  options: LandmassMeshOptions = {},
): Mesh {
  const size = Math.max(0.001, options.size ?? 10);
  const heightMultiplier = options.heightMultiplier ?? 4;
  const heightCurve = options.heightCurve ?? ((h: number) => h);
  const lod = Math.max(0, Math.round(options.lod ?? 0));
  const step = landmassLODStep(lod);
  const xs = sampledIndices(heightMap.width, step);
  const ys = sampledIndices(heightMap.height, step);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const heightAt = (sampleX: number, sampleY: number): number =>
    clamp(heightCurve(sampleField2D(heightMap, sampleX, sampleY)), 0, 1) * heightMultiplier;

  for (let y = 0; y < ys.length; y++) {
    const sy = ys[y]!;
    const ty = heightMap.height === 1 ? 0 : sy / (heightMap.height - 1);
    for (let x = 0; x < xs.length; x++) {
      const sx = xs[x]!;
      const tx = heightMap.width === 1 ? 0 : sx / (heightMap.width - 1);
      const wx = options.originX === undefined ? (tx - 0.5) * size : options.originX + tx * size;
      const wz = options.originZ === undefined ? (ty - 0.5) * size : options.originZ + ty * size;
      const h = stitchedLandmassEdgeHeight(
        heightMap,
        sx,
        sy,
        lod,
        options.edgeLODs,
        heightAt,
      );
      positions.push(vec3(wx, h, wz));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(tx, 1 - ty));
    }
  }

  const stride = xs.length;
  for (let y = 0; y < ys.length - 1; y++) {
    for (let x = 0; x < xs.length - 1; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const skirtDepth = Math.max(0, options.skirtDepth ?? 0);
  if (skirtDepth > 0 && xs.length > 1 && ys.length > 1) {
    appendLandmassSkirt(
      positions,
      normals,
      uvs,
      indices,
      landmassBoundaryIndices(xs.length, ys.length),
      skirtDepth,
    );
  }

  const mesh = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  return options.flatShaded ? flatShadeMesh(mesh) : mesh;
}

export function buildLandmassTerrain(options: LandmassTerrainOptions = {}): LandmassTerrainResult {
  const map = buildLandmassMap(options);
  const mesh = landmassHeightfieldToMesh(map.heightMap, options);
  const colors = remapColorsToMesh(map.heightMap, map.colorMap, mesh);
  return { ...map, mesh, colors };
}

export function buildLandmassChunk(options: LandmassChunkOptions = {}): LandmassChunk {
  const chunkX = Math.round(options.chunkX ?? 0);
  const chunkZ = Math.round(options.chunkZ ?? 0);
  const width = Math.max(2, Math.round(options.width ?? 129));
  const height = Math.max(2, Math.round(options.height ?? width));
  const size = Math.max(0.001, options.chunkSize ?? options.size ?? 10);
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const sampleOffsetX = (options.offsetX ?? 0) + chunkX * (width - 1);
  const sampleOffsetY = (options.offsetY ?? 0) + chunkZ * (height - 1);
  const data = buildLandmassTerrain({
    ...options,
    width,
    height,
    size,
    offsetX: sampleOffsetX,
    offsetY: sampleOffsetY,
    originX,
    originZ,
    normalizeMode: options.normalizeMode ?? "global",
  });
  return { chunkX, chunkZ, originX, originZ, size, data };
}

export function buildLandmassChunkGrid(
  options: LandmassChunkOptions & { radius?: number } = {},
): LandmassChunk[] {
  const radius = Math.max(0, Math.round(options.radius ?? 1));
  const chunks: LandmassChunk[] = [];
  for (let z = -radius; z <= radius; z++) {
    for (let x = -radius; x <= radius; x++) {
      chunks.push(buildLandmassChunk({ ...options, chunkX: x, chunkZ: z }));
    }
  }
  return chunks;
}

export function chooseLandmassLOD(distance: number, levels: LandmassLODLevel[]): number {
  if (levels.length === 0) return 0;
  const ordered = levels.slice().sort((a, b) => a.distance - b.distance);
  let lod = ordered[0]!.lod;
  for (const level of ordered) {
    if (distance >= level.distance) lod = level.lod;
  }
  return Math.max(0, Math.round(lod));
}

/**
 * Camera-centred chunk scheduler with async request deduplication and LRU cache.
 * Geometry remains deterministic; callers can provide a Worker-backed generator.
 */
export class LandmassChunkStreamer {
  private readonly options: LandmassChunkOptions;
  private readonly radius: number;
  private readonly lodLevels: LandmassLODLevel[];
  private readonly maxCachedChunks: number;
  private readonly generateChunk: LandmassChunkGenerator;
  private readonly schedule: () => Promise<void>;
  private readonly cache = new Map<string, LandmassChunkCacheEntry>();
  private useCounter = 0;

  constructor(options: LandmassChunkStreamerOptions = {}) {
    const {
      radius = 1,
      lodLevels = [{ distance: 0, lod: options.lod ?? 0 }],
      maxCachedChunks = 64,
      generateChunk = buildLandmassChunk,
      schedule = () => Promise.resolve(),
      ...chunkOptions
    } = options;
    this.options = chunkOptions;
    this.radius = Math.max(0, Math.round(radius));
    this.lodLevels = lodLevels.slice();
    this.maxCachedChunks = Math.max(1, Math.round(maxCachedChunks));
    this.generateChunk = generateChunk;
    this.schedule = schedule;
  }

  get cachedChunkCount(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  async update(viewerX: number, viewerZ: number): Promise<LandmassChunk[]> {
    const chunkSize = Math.max(0.001, this.options.chunkSize ?? this.options.size ?? 10);
    const centerX = Math.floor(viewerX / chunkSize);
    const centerZ = Math.floor(viewerZ / chunkSize);
    const desired = [] as Array<{ x: number; z: number; lod: number; distance: number }>;
    const lodByCoord = new Map<string, number>();

    for (let z = centerZ - this.radius; z <= centerZ + this.radius; z++) {
      for (let x = centerX - this.radius; x <= centerX + this.radius; x++) {
        const distance = Math.hypot(
          viewerX - (x + 0.5) * chunkSize,
          viewerZ - (z + 0.5) * chunkSize,
        );
        const lod = chooseLandmassLOD(distance, this.lodLevels);
        desired.push({ x, z, lod, distance });
        lodByCoord.set(landmassCoordKey(x, z), lod);
      }
    }
    desired.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);

    const visibleKeys = new Set<string>();
    const chunks = await Promise.all(desired.map(({ x, z, lod }) => {
      const edgeLODs = landmassNeighbourLODs(x, z, lodByCoord);
      const key = landmassChunkCacheKey(x, z, lod, edgeLODs);
      visibleKeys.add(key);
      return this.requestChunk(key, {
        ...this.options,
        chunkX: x,
        chunkZ: z,
        chunkSize,
        lod,
        edgeLODs,
      });
    }));
    this.evictUnusedChunks(visibleKeys);
    return chunks;
  }

  private requestChunk(key: string, options: LandmassChunkOptions): Promise<LandmassChunk> {
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = ++this.useCounter;
      return cached.promise;
    }

    const promise = this.generateScheduled(options).catch((error: unknown) => {
      this.cache.delete(key);
      throw error;
    });
    const entry: LandmassChunkCacheEntry = {
      lastUsed: ++this.useCounter,
      promise,
    };
    this.cache.set(key, entry);
    return entry.promise;
  }

  private async generateScheduled(options: LandmassChunkOptions): Promise<LandmassChunk> {
    await this.schedule();
    return this.generateChunk(options);
  }

  private evictUnusedChunks(visibleKeys: Set<string>): void {
    if (this.cache.size <= this.maxCachedChunks) return;
    const candidates = [...this.cache.entries()]
      .filter(([key]) => !visibleKeys.has(key))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed || a[0].localeCompare(b[0]));
    for (const [key] of candidates) {
      if (this.cache.size <= this.maxCachedChunks) break;
      this.cache.delete(key);
    }
  }
}

export function landmassStudySummary(): string[] {
  return [
    "E01-E03：分层 Perlin 噪声、octave、persistence、lacunarity、seed offset。",
    "E04-E05：高度阈值生成地形类型和颜色图，同一张高度图三角化成网格。",
    "E06-E10：LOD 和无限区块；全局归一化加共享边界采样，避免接缝。",
    "E11：falloff map 扣低边缘高度，形成带海岸线的岛屿。",
    "E12-E14：重算法线或 flat shading，只改视觉读法，不改高度数据。",
    "E15-E21：数据配置、材质/着色拆分、修复、优化和围绕可复用设置重构。",
  ];
}

function normalizeTerrainTypes(types: LandmassTerrainType[]): LandmassTerrainType[] {
  if (types.length === 0) return DEFAULT_LANDMASS_TERRAIN_TYPES;
  return types
    .map((type) => ({ ...type, height: clamp(type.height, 0, 1) }))
    .sort((a, b) => a.height - b.height);
}

function landmassCoordKey(x: number, z: number): string {
  return `${x},${z}`;
}

function landmassNeighbourLODs(
  x: number,
  z: number,
  lodByCoord: Map<string, number>,
): LandmassEdgeLODs {
  const edgeLODs: LandmassEdgeLODs = {};
  const north = lodByCoord.get(landmassCoordKey(x, z - 1));
  const east = lodByCoord.get(landmassCoordKey(x + 1, z));
  const south = lodByCoord.get(landmassCoordKey(x, z + 1));
  const west = lodByCoord.get(landmassCoordKey(x - 1, z));
  if (north !== undefined) edgeLODs.north = north;
  if (east !== undefined) edgeLODs.east = east;
  if (south !== undefined) edgeLODs.south = south;
  if (west !== undefined) edgeLODs.west = west;
  return edgeLODs;
}

function landmassChunkCacheKey(
  x: number,
  z: number,
  lod: number,
  edgeLODs: LandmassEdgeLODs,
): string {
  return `${landmassCoordKey(x, z)}@${lod}:${edgeLODs.north ?? "-"},${edgeLODs.east ?? "-"},${edgeLODs.south ?? "-"},${edgeLODs.west ?? "-"}`;
}

function sampledIndices(count: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  if (out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
}

function landmassLODStep(lod: number): number {
  return lod === 0 ? 1 : lod * 2;
}

function stitchedLandmassEdgeHeight(
  heightMap: Field2D,
  x: number,
  y: number,
  lod: number,
  edgeLODs: LandmassEdgeLODs | undefined,
  heightAt: (x: number, y: number) => number,
): number {
  let height = heightAt(x, y);
  if (!edgeLODs) return height;
  if (y === 0 && (edgeLODs.north ?? lod) > lod) {
    height = interpolateLandmassEdgeHeight(x, heightMap.width, edgeLODs.north!, (sample) => heightAt(sample, 0));
  }
  if (x === heightMap.width - 1 && (edgeLODs.east ?? lod) > lod) {
    height = interpolateLandmassEdgeHeight(y, heightMap.height, edgeLODs.east!, (sample) => heightAt(heightMap.width - 1, sample));
  }
  if (y === heightMap.height - 1 && (edgeLODs.south ?? lod) > lod) {
    height = interpolateLandmassEdgeHeight(x, heightMap.width, edgeLODs.south!, (sample) => heightAt(sample, heightMap.height - 1));
  }
  if (x === 0 && (edgeLODs.west ?? lod) > lod) {
    height = interpolateLandmassEdgeHeight(y, heightMap.height, edgeLODs.west!, (sample) => heightAt(0, sample));
  }
  return height;
}

function interpolateLandmassEdgeHeight(
  index: number,
  count: number,
  lod: number,
  heightAt: (index: number) => number,
): number {
  const coarse = sampledIndices(count, landmassLODStep(Math.max(0, Math.round(lod))));
  for (let i = 1; i < coarse.length; i++) {
    const end = coarse[i]!;
    if (index > end) continue;
    const start = coarse[i - 1]!;
    const t = (index - start) / (end - start || 1);
    return lerp(heightAt(start), heightAt(end), t);
  }
  return heightAt(count - 1);
}

function landmassBoundaryIndices(width: number, height: number): number[][] {
  const north = Array.from({ length: width }, (_, x) => x);
  const east = Array.from({ length: height }, (_, y) => y * width + width - 1);
  const south = Array.from({ length: width }, (_, x) => (height - 1) * width + width - 1 - x);
  const west = Array.from({ length: height }, (_, y) => (height - 1 - y) * width);
  return [north, east, south, west];
}

function appendLandmassSkirt(
  positions: Vec3[],
  normals: Vec3[],
  uvs: ReturnType<typeof vec2>[],
  indices: number[],
  boundaries: number[][],
  depth: number,
): void {
  for (const boundary of boundaries) {
    const bottom: number[] = [];
    for (const topIndex of boundary) {
      const top = positions[topIndex]!;
      bottom.push(positions.length);
      positions.push(vec3(top.x, top.y - depth, top.z));
      normals.push(vec3(0, 1, 0));
      uvs.push(uvs[topIndex]!);
    }
    for (let i = 0; i < boundary.length - 1; i++) {
      const topA = boundary[i]!;
      const topB = boundary[i + 1]!;
      const bottomA = bottom[i]!;
      const bottomB = bottom[i + 1]!;
      indices.push(topA, topB, bottomA, topB, bottomB, bottomA);
    }
  }
}

function clampLandmassHeightMap(heightMap: Field2D): Field2D {
  const out = makeField2D(heightMap.width, heightMap.height);
  for (let i = 0; i < heightMap.data.length; i++) {
    out.data[i] = clamp(heightMap.data[i]!, 0, 1);
  }
  return out;
}

function restoreLandmassEdges(heightMap: Field2D, source: Field2D): Field2D {
  const out = makeField2D(heightMap.width, heightMap.height);
  out.data.set(heightMap.data);
  for (let x = 0; x < heightMap.width; x++) {
    out.data[x] = source.data[x]!;
    const south = (heightMap.height - 1) * heightMap.width + x;
    out.data[south] = source.data[south]!;
  }
  for (let y = 0; y < heightMap.height; y++) {
    const west = y * heightMap.width;
    const east = west + heightMap.width - 1;
    out.data[west] = source.data[west]!;
    out.data[east] = source.data[east]!;
  }
  return out;
}

function remapColorsToMesh(heightMap: Field2D, colorMap: number[], mesh: Mesh): number[] {
  const stats = field2DStats(heightMap);
  if (mesh.positions.length === heightMap.data.length) return colorMap.slice();
  const colors: number[] = [];
  for (const uv of mesh.uvs) {
    const x = Math.round(uv.x * (heightMap.width - 1));
    const y = Math.round((1 - uv.y) * (heightMap.height - 1));
    const i = (y * heightMap.width + x) * 3;
    const shade = lerp(0.92, 1.06, clamp((sampleField2D(heightMap, x, y) - stats.min) / (stats.max - stats.min || 1), 0, 1));
    colors.push(
      clamp(colorMap[i]! * shade, 0, 1),
      clamp(colorMap[i + 1]! * shade, 0, 1),
      clamp(colorMap[i + 2]! * shade, 0, 1),
    );
  }
  return colors;
}

function flatShadeMesh(mesh: Mesh): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i]!;
    const ib = mesh.indices[i + 1]!;
    const ic = mesh.indices[i + 2]!;
    const a = mesh.positions[ia]!;
    const b = mesh.positions[ib]!;
    const c = mesh.positions[ic]!;
    const n = normalize(cross(sub(b, a), sub(c, a)));
    const out = positions.length;
    positions.push(a, b, c);
    normals.push(n, n, n);
    uvs.push(mesh.uvs[ia]!, mesh.uvs[ib]!, mesh.uvs[ic]!);
    indices.push(out, out + 1, out + 2);
  }
  return makeMesh({ positions, normals, uvs, indices });
}
