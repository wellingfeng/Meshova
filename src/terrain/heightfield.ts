/**
 * Gaea-style terrain heightfield core.
 *
 * Terrain stays as scalar fields first: height, masks, erosion outputs. Meshes
 * and materials are views over those fields, so AI/code can iterate parameters
 * without baking one-off geometry.
 */
import { makeField2D, field2DStats, sampleField2D, type Field2D } from "../field/index.js";
import { makeMesh, recomputeNormals, type Mesh } from "../geometry/index.js";
import { clamp, lerp, smoothstep } from "../math/scalar.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { fbm2, makeNoise } from "../random/noise.js";
import {
  makeTerrainFieldSet,
  terrainMasksFromFieldSet,
  type TerrainFieldSet,
} from "./field-set.js";

export interface TerrainPrimitiveOptions {
  /** Grid cells per side. Output field has resolution+1 samples. */
  resolution?: number;
  /** Deterministic terrain seed. */
  seed?: number;
  /** World-space height multiplier. */
  height?: number;
  /** Base elevation offset. */
  base?: number;
  /** Frequency for broad landform noise. */
  noiseScale?: number;
  /** Frequency for ridge/mountain detail. */
  ridgeScale?: number;
  /** Ridge contribution to the landform. */
  ridgeStrength?: number;
  /** Radial island falloff. 0 disables island shaping. */
  islandFalloff?: number;
  /** Blend terraced contours into the raw landform. */
  terraceStrength?: number;
  /** Number of terrace bands when terraceStrength > 0. */
  terraceSteps?: number;
}

export interface TerrainErosionOptions {
  /** Number of erosion cycles. */
  iterations?: number;
  /** Downhill water-carving strength per cycle. */
  hydraulicStrength?: number;
  /** Talus smoothing strength per cycle. */
  thermalStrength?: number;
  /** Height difference tolerated before thermal movement starts. */
  talus?: number;
  /** Scalar rain amount or per-cell precipitation mask. */
  rain?: number | Field2D;
  /** Fraction of carved sediment deposited in the next lower cell. */
  depositionRate?: number;
}

export interface TerrainMaskOptions {
  /** Full world width/depth represented by the heightfield. */
  size?: number;
  /** Elevation considered water. */
  waterLevel?: number;
  /** Soft shoreline band around waterLevel. */
  shoreWidth?: number;
  /** Slope normalization strength. */
  slopeScale?: number;
}

export interface TerrainBuildOptions extends TerrainPrimitiveOptions, TerrainErosionOptions, TerrainMaskOptions {
  /** Size used by mesh conversion. */
  size?: number;
}

export interface TerrainErosionResult {
  height: Field2D;
  wear: Field2D;
  deposition: Field2D;
  flow: Field2D;
}

export interface TerrainDerivedMasks {
  /** Steepness mask, 0=flat, 1=near vertical. */
  slope: Field2D;
  /** Flow accumulation mask, log-normalized. */
  flow: Field2D;
  /** Convex ridge mask. */
  convexity: Field2D;
  /** Low/underwater mask. */
  water: Field2D;
  /** Approximate eroded/worn areas from slope+flow. */
  wear: Field2D;
  /** Approximate sediment/deposit areas from concavity+flow. */
  deposition: Field2D;
}

export interface TerrainBuildResult {
  height: Field2D;
  masks: TerrainDerivedMasks;
  fieldSet: TerrainFieldSet;
  mesh: Mesh;
  /** Per-vertex RGB triples matching mesh.positions. */
  colors: number[];
}

export function makeTerrainPrimitiveField(options: TerrainPrimitiveOptions = {}): Field2D {
  const resolution = Math.max(2, Math.min(1024, Math.round(options.resolution ?? 128)));
  const size = resolution + 1;
  const seed = Math.round(options.seed ?? 1) >>> 0;
  const height = Math.max(0, options.height ?? 1);
  const base = options.base ?? 0;
  const noiseScale = Math.max(0.01, options.noiseScale ?? 1.15);
  const ridgeScale = Math.max(0.01, options.ridgeScale ?? noiseScale * 2.35);
  const ridgeStrength = clamp(options.ridgeStrength ?? 0.45, 0, 2);
  const islandFalloff = Math.max(0, options.islandFalloff ?? 1.5);
  const terraceStrength = clamp(options.terraceStrength ?? 0, 0, 1);
  const terraceSteps = Math.max(2, Math.round(options.terraceSteps ?? 9));
  const broad = makeNoise(seed);
  const ridges = makeNoise(seed + 101);
  const detail = makeNoise(seed + 211);

  const out = makeField2D(size, size);
  for (let y = 0; y < size; y++) {
    const v = size === 1 ? 0 : y / (size - 1);
    const nz = v * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = size === 1 ? 0 : x / (size - 1);
      const nx = u * 2 - 1;
      const radial = Math.hypot(nx, nz);
      const island = islandFalloff > 0
        ? clamp(1 - Math.pow(radial, islandFalloff), 0, 1)
        : 1;
      const macro = fbm2(broad, nx * noiseScale + 5.1, nz * noiseScale - 2.7, {
        octaves: 5,
        gain: 0.52,
      }) * 0.5 + 0.5;
      const ridgeRaw = fbm2(ridges, nx * ridgeScale - 3.5, nz * ridgeScale + 4.9, {
        octaves: 4,
        gain: 0.48,
      });
      const ridge = Math.pow(1 - Math.abs(ridgeRaw), 1.75);
      const grit = fbm2(detail, nx * ridgeScale * 3.7, nz * ridgeScale * 3.7, {
        octaves: 3,
        gain: 0.45,
      }) * 0.5 + 0.5;
      let land = clamp((macro * 0.62 + ridge * ridgeStrength + grit * 0.08) * island, 0, 1.35);
      if (terraceStrength > 0) {
        const terraced = Math.round(land * terraceSteps) / terraceSteps;
        land = lerp(land, terraced, terraceStrength);
      }
      out.data[y * size + x] = base + land * height;
    }
  }
  return out;
}

export function erodeTerrainHeightfield(
  height: Field2D,
  options: TerrainErosionOptions = {},
): TerrainErosionResult {
  const w = height.width;
  const h = height.height;
  const iterations = Math.max(0, Math.round(options.iterations ?? 24));
  const hydraulicStrength = Math.max(0, options.hydraulicStrength ?? 0.018);
  const thermalStrength = Math.max(0, options.thermalStrength ?? 0.055);
  const talus = Math.max(0, options.talus ?? 0.045);
  const depositionRate = clamp(options.depositionRate ?? 0.58, 0, 1);
  const rain = options.rain ?? 1;
  const wear = makeField2D(w, h);
  const deposition = makeField2D(w, h);
  let curr = new Float32Array(height.data);

  for (let it = 0; it < iterations; it++) {
    const next = new Float32Array(curr);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const lower = lowestNeighbor(curr, w, h, x, y);
        if (lower < 0) continue;
        const diff = curr[i]! - curr[lower]!;
        if (diff <= 0) continue;

        const r = typeof rain === "number" ? rain : sampleField2D(rain, x, y);
        const hydro = diff * hydraulicStrength * clamp(r, 0, 4);
        if (hydro > 0) {
          next[i] = next[i]! - hydro;
          const deposit = hydro * depositionRate;
          next[lower] = next[lower]! + deposit;
          wear.data[i] = wear.data[i]! + hydro;
          deposition.data[lower] = deposition.data[lower]! + deposit;
        }

        if (diff > talus && thermalStrength > 0) {
          const moved = (diff - talus) * thermalStrength;
          next[i] = next[i]! - moved;
          next[lower] = next[lower]! + moved;
          wear.data[i] = wear.data[i]! + moved;
          deposition.data[lower] = deposition.data[lower]! + moved;
        }
      }
    }
    curr = next;
  }

  const out = makeField2D(w, h);
  out.data.set(curr);
  return {
    height: out,
    wear: normalizeNonZero(wear),
    deposition: normalizeNonZero(deposition),
    flow: flowAccumulationField(out, rain),
  };
}

export function deriveTerrainMasks(height: Field2D, options: TerrainMaskOptions = {}): TerrainDerivedMasks {
  const slope = slopeField(height, options);
  const flow = flowAccumulationField(height, 1);
  const convexity = convexityField(height);
  const water = waterField(height, options.waterLevel ?? 0, options.shoreWidth ?? 0.04);
  const wear = makeField2D(height.width, height.height);
  const deposition = makeField2D(height.width, height.height);
  for (let i = 0; i < height.data.length; i++) {
    const s = slope.data[i]!;
    const f = flow.data[i]!;
    const c = convexity.data[i]!;
    wear.data[i] = clamp(s * 0.65 + f * s * 0.55 + c * 0.18, 0, 1);
    deposition.data[i] = clamp(f * (1 - s) * 0.8 + (1 - c) * 0.12, 0, 1);
  }
  return { slope, flow, convexity, water, wear, deposition };
}

export function buildTerrainField(options: TerrainBuildOptions = {}): TerrainBuildResult {
  const primitive = makeTerrainPrimitiveField(options);
  const erosionIterations = Math.max(0, Math.round(options.iterations ?? 24));
  const eroded = erosionIterations > 0
    ? erodeTerrainHeightfield(primitive, options)
    : { height: primitive, wear: makeField2D(primitive.width, primitive.height), deposition: makeField2D(primitive.width, primitive.height), flow: flowAccumulationField(primitive, 1) };
  const masks = deriveTerrainMasks(eroded.height, options);
  const fieldSet = makeTerrainFieldSet(eroded.height, {
    ...masks,
    flow: eroded.flow,
    wear: maxField(masks.wear, eroded.wear),
    deposition: maxField(masks.deposition, eroded.deposition),
  });
  const colors = terrainVertexColors(eroded.height, terrainMasksFromFieldSet(fieldSet));
  const mesh = heightfieldToTerrainMesh(eroded.height, { size: options.size ?? 10 });
  return { height: eroded.height, masks: terrainMasksFromFieldSet(fieldSet), fieldSet, mesh, colors };
}

export function heightfieldToTerrainMesh(
  height: Field2D,
  options: { size?: number; heightScale?: number; baseY?: number } = {},
): Mesh {
  const w = height.width;
  const h = height.height;
  const size = Math.max(0.001, options.size ?? 10);
  const heightScale = options.heightScale ?? 1;
  const baseY = options.baseY ?? 0;
  const half = size * 0.5;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let y = 0; y < h; y++) {
    const ty = h === 1 ? 0 : y / (h - 1);
    for (let x = 0; x < w; x++) {
      const tx = w === 1 ? 0 : x / (w - 1);
      const z = -half + ty * size;
      const wx = -half + tx * size;
      positions.push(vec3(wx, baseY + height.data[y * w + x]! * heightScale, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(tx, 1 - ty));
    }
  }

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = y * w + x;
      const b = a + w;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

export function terrainVertexColors(height: Field2D, masks: TerrainDerivedMasks): number[] {
  const stats = field2DStats(height);
  const span = stats.max - stats.min || 1;
  const colors: number[] = [];
  const sand: [number, number, number] = [0.7, 0.58, 0.36];
  const grass: [number, number, number] = [0.22, 0.38, 0.16];
  const rock: [number, number, number] = [0.42, 0.41, 0.37];
  const wet: [number, number, number] = [0.16, 0.24, 0.14];
  const snow: [number, number, number] = [0.82, 0.84, 0.8];

  for (let i = 0; i < height.data.length; i++) {
    const elev = (height.data[i]! - stats.min) / span;
    const slope = masks.slope.data[i]!;
    const water = masks.water.data[i]!;
    const flow = masks.flow.data[i]!;
    const wear = masks.wear.data[i]!;
    const depo = masks.deposition.data[i]!;
    let c = mixRgb(sand, grass, smoothstep(0.08, 0.32, elev));
    c = mixRgb(c, rock, clamp(slope * 0.85 + wear * 0.35, 0, 1));
    c = mixRgb(c, wet, clamp(flow * 0.32 + depo * 0.18, 0, 1));
    c = mixRgb(c, sand, water * 0.75);
    c = mixRgb(c, snow, smoothstep(0.84, 0.98, elev) * (1 - water));
    colors.push(c[0], c[1], c[2]);
  }
  return colors;
}

function slopeField(height: Field2D, options: TerrainMaskOptions): Field2D {
  const out = makeField2D(height.width, height.height);
  const cellSize = Math.max(1e-6, (options.size ?? 10) / Math.max(1, height.width - 1));
  const slopeScale = Math.max(0.001, options.slopeScale ?? 1.25);
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      const dx = (sampleField2D(height, x + 1, y) - sampleField2D(height, x - 1, y)) / (2 * cellSize);
      const dz = (sampleField2D(height, x, y + 1) - sampleField2D(height, x, y - 1)) / (2 * cellSize);
      out.data[y * height.width + x] = clamp(Math.atan(Math.hypot(dx, dz) * slopeScale) / (Math.PI * 0.5), 0, 1);
    }
  }
  return out;
}

function convexityField(height: Field2D): Field2D {
  const raw = makeField2D(height.width, height.height);
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      const c = sampleField2D(height, x, y);
      const avg = (
        sampleField2D(height, x - 1, y) +
        sampleField2D(height, x + 1, y) +
        sampleField2D(height, x, y - 1) +
        sampleField2D(height, x, y + 1)
      ) * 0.25;
      raw.data[y * height.width + x] = c - avg;
    }
  }
  return normalizeNonZero(raw);
}

function waterField(height: Field2D, waterLevel: number, shoreWidth: number): Field2D {
  const out = makeField2D(height.width, height.height);
  const width = Math.max(1e-6, shoreWidth);
  for (let i = 0; i < height.data.length; i++) {
    out.data[i] = 1 - smoothstep(waterLevel - width, waterLevel + width, height.data[i]!);
  }
  return out;
}

function flowAccumulationField(height: Field2D, rain: number | Field2D): Field2D {
  const w = height.width;
  const h = height.height;
  const accum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      accum[y * w + x] = typeof rain === "number" ? Math.max(0, rain) : Math.max(0, sampleField2D(rain, x, y));
    }
  }
  const order = Array.from({ length: w * h }, (_, i) => i);
  order.sort((a, b) => height.data[b]! - height.data[a]!);
  for (const i of order) {
    const x = i % w;
    const y = Math.floor(i / w);
    const lower = lowestNeighbor(height.data, w, h, x, y);
    if (lower >= 0) accum[lower] = accum[lower]! + accum[i]! * 0.92;
  }
  const out = makeField2D(w, h);
  let max = 0;
  for (const v of accum) if (v > max) max = v;
  const norm = Math.log1p(max) || 1;
  for (let i = 0; i < accum.length; i++) out.data[i] = clamp(Math.log1p(accum[i]!) / norm, 0, 1);
  return out;
}

function lowestNeighbor(data: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  const i = y * width + x;
  let best = i;
  let bestHeight = data[i]!;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      const h = data[ni]!;
      if (h < bestHeight) {
        bestHeight = h;
        best = ni;
      }
    }
  }
  return best === i ? -1 : best;
}

function normalizeNonZero(field: Field2D): Field2D {
  const stats = field2DStats(field);
  const span = stats.max - stats.min;
  const out = makeField2D(field.width, field.height);
  if (span <= 1e-12) return out;
  for (let i = 0; i < field.data.length; i++) out.data[i] = clamp((field.data[i]! - stats.min) / span, 0, 1);
  return out;
}

function maxField(a: Field2D, b: Field2D): Field2D {
  const out = makeField2D(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = Math.max(a.data[i]!, b.data[i]!);
  return out;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const k = clamp(t, 0, 1);
  return [
    lerp(a[0], b[0], k),
    lerp(a[1], b[1], k),
    lerp(a[2], b[2], k),
  ];
}
