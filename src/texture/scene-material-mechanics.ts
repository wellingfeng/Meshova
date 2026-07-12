import type { Mesh } from "../geometry/mesh.js";
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import type { Vec3 } from "../math/vec3.js";
import { fbm3, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { generate, makeTexture, sample, type TextureBuffer } from "./buffer.js";
import { bakeGeometryToTextures } from "./geometry-bake.js";

type RGB = [number, number, number];

const clamp01 = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);

function wrap(value: number, size: number): number {
  return (value % size + size) % size;
}

function wrappedSample(texture: TextureBuffer, x: number, y: number, channel = 0): number {
  const ix = wrap(Math.round(x), texture.width);
  const iy = wrap(Math.round(y), texture.height);
  return texture.data[(iy * texture.width + ix) * texture.channels + channel]!;
}

function flatTexture(size: number, value: number, channels = 1): TextureBuffer {
  const texture = makeTexture(size, size, channels);
  texture.data.fill(value);
  return texture;
}

export interface Noise3DOptions {
  seed?: number;
  scale?: number;
  octaves?: number;
  lacunarity?: number;
  gain?: number;
}

/** Deterministic world-space 3D FBM, normalized to [0,1]. */
export function noise3D(position: Vec3, options: Noise3DOptions = {}): number {
  const noise = makeNoise(options.seed ?? 0);
  const scale = options.scale ?? 1;
  return clamp01(fbm3(noise, position.x * scale, position.y * scale, position.z * scale, {
    octaves: options.octaves ?? 5,
    lacunarity: options.lacunarity ?? 2,
    gain: options.gain ?? 0.5,
  }) * 0.5 + 0.5);
}

export interface TriplanarNoiseOptions extends Noise3DOptions {
  sharpness?: number;
}

/** UV-free scalar sample. Noise is evaluated on three planes and blended by normal. */
export function triplanarNoise3D(
  position: Vec3,
  normal: Vec3,
  options: TriplanarNoiseOptions = {},
): number {
  const sharpness = Math.max(0.1, options.sharpness ?? 4);
  const weights = [
    Math.pow(Math.abs(normal.x), sharpness),
    Math.pow(Math.abs(normal.y), sharpness),
    Math.pow(Math.abs(normal.z), sharpness),
  ];
  const total = weights[0]! + weights[1]! + weights[2]! || 1;
  const scale = options.scale ?? 1;
  const noise = makeNoise(options.seed ?? 0);
  const samplePlane = (x: number, y: number, offset: number) => clamp01(
    fbm3(noise, x * scale, y * scale, offset, {
      octaves: options.octaves ?? 5,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
    }) * 0.5 + 0.5,
  );
  return (
    samplePlane(position.z, position.y, 13.1) * weights[0]!
    + samplePlane(position.x, position.z, 37.7) * weights[1]!
    + samplePlane(position.x, position.y, 71.3) * weights[2]!
  ) / total;
}

export interface SceneAttributeBake {
  ao: TextureBuffer;
  curvature: TextureBuffer;
  thickness: TextureBuffer;
  slope: TextureBuffer;
  height: TextureBuffer;
  worldPosition: TextureBuffer;
  coverage: TextureBuffer;
}

export interface SceneAttributeBakeOptions {
  size?: number;
  thicknessRadius?: number;
  heightAxis?: Vec3;
}

/** Bake mesh-aware AO, curvature, thickness, slope and approximate world position maps. */
export function bakeMeshSceneAttributes(
  mesh: Mesh,
  options: SceneAttributeBakeOptions = {},
): SceneAttributeBake {
  const size = Math.max(4, Math.round(options.size ?? 256));
  const baked = bakeGeometryToTextures(mesh, {
    width: size,
    height: size,
    ...(options.heightAxis ? { heightAxis: options.heightAxis } : {}),
  });
  const slope = makeTexture(size, size, 1);
  const thickness = makeTexture(size, size, 1);
  const worldPosition = makeTexture(size, size, 3);
  const radius = Math.max(1, Math.round(options.thicknessRadius ?? Math.max(2, size / 32)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = y * size + x;
      const normalY = baked.normal.data[pixel * 3 + 1]! * 2 - 1;
      slope.data[pixel] = clamp01(1 - Math.abs(normalY));
      let occupied = 0;
      let total = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
          occupied += sample(baked.coverage, x + offsetX, y + offsetY);
          total++;
        }
      }
      thickness.data[pixel] = clamp01(total > 0 ? occupied / total : 0);
      worldPosition.data[pixel * 3] = (x + 0.5) / size;
      worldPosition.data[pixel * 3 + 1] = baked.height.data[pixel]!;
      worldPosition.data[pixel * 3 + 2] = 1 - (y + 0.5) / size;
    }
  }
  return {
    ao: baked.ao,
    curvature: baked.curvature,
    thickness,
    slope,
    height: baked.height,
    worldPosition,
    coverage: baked.coverage,
  };
}

export interface VectorTransportOptions {
  steps?: number;
  distance?: number;
  diffusion?: number;
  dissipation?: number;
  deposition?: number;
}

export interface VectorTransportResult {
  field: TextureBuffer;
  deposited: TextureBuffer;
}

/** Periodic semi-Lagrangian transport for rain, wind, liquid and pollutants. */
export function transportScalarField(
  source: TextureBuffer,
  velocity: TextureBuffer,
  options: VectorTransportOptions = {},
): VectorTransportResult {
  if (source.channels !== 1) throw new Error("source must have one channel");
  if (velocity.channels !== 2 || velocity.width !== source.width || velocity.height !== source.height) {
    throw new Error("velocity must match source and have two channels");
  }
  const steps = Math.max(1, Math.round(options.steps ?? 6));
  const distance = options.distance ?? 1;
  const diffusion = clamp01(options.diffusion ?? 0.08);
  const dissipation = clamp01(options.dissipation ?? 0.02);
  const depositionRate = clamp01(options.deposition ?? 0.06);
  let field = makeTexture(source.width, source.height, 1);
  field.data.set(source.data);
  const deposited = makeTexture(source.width, source.height, 1);
  for (let step = 0; step < steps; step++) {
    const next = makeTexture(source.width, source.height, 1);
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const pixel = y * source.width + x;
        const vx = velocity.data[pixel * 2]! * 2 - 1;
        const vy = velocity.data[pixel * 2 + 1]! * 2 - 1;
        const advected = wrappedSample(field, x - vx * distance, y - vy * distance);
        const neighbors = (
          wrappedSample(field, x - 1, y) + wrappedSample(field, x + 1, y)
          + wrappedSample(field, x, y - 1) + wrappedSample(field, x, y + 1)
        ) * 0.25;
        const mixed = advected + (neighbors - advected) * diffusion;
        const retained = clamp01(mixed * (1 - dissipation));
        const deposit = Math.max(0, mixed - retained) + retained * depositionRate * (1 - Math.hypot(vx, vy) * 0.4);
        next.data[pixel] = clamp01(retained - deposit * 0.25);
        deposited.data[pixel] = clamp01(deposited.data[pixel]! + deposit);
      }
    }
    field = next;
  }
  return { field, deposited };
}

export interface SurfaceEvolutionOptions {
  seed?: number;
  time?: number;
  humidity?: number;
  temperature?: number;
  salinity?: number;
  sunlight?: number;
  traffic?: number;
  wind?: readonly [number, number];
  iterations?: number;
}

export interface SurfaceEvolutionResult {
  moisture: TextureBuffer;
  growth: TextureBuffer;
  corrosion: TextureBuffer;
  sediment: TextureBuffer;
  wear: TextureBuffer;
  cracking: TextureBuffer;
  flow: TextureBuffer;
}

/** Coupled deterministic evolution of moisture, growth, corrosion, sediment and wear. */
export function simulateSurfaceEvolution(
  size: number,
  options: SurfaceEvolutionOptions = {},
): SurfaceEvolutionResult {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const seed = options.seed ?? 0;
  const time = clamp01(options.time ?? 0.7);
  const humidity = clamp01(options.humidity ?? 0.65);
  const temperature = clamp01(options.temperature ?? 0.5);
  const salinity = clamp01(options.salinity ?? 0);
  const sunlight = clamp01(options.sunlight ?? 0.5);
  const traffic = clamp01(options.traffic ?? 0);
  const wind = options.wind ?? [0.18, -0.72];
  const noise = makeNoise(seed);
  const moisture = generate(size, size, 1, (u, v) => clamp01(
    humidity * (0.42 + (fbm3(noise, u * 4, v * 4, time * 2, { octaves: 4 }) * 0.5 + 0.5) * 0.58)
    + (1 - v) * humidity * 0.25,
  ));
  const velocity = generate(size, size, 2, (u, v) => {
    const turbulence = noise.noise3(u * 3, v * 3, time) * 0.28;
    const angle = Math.atan2(wind[1], wind[0]) + turbulence;
    return [Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5];
  });
  const transport = transportScalarField(moisture, velocity, {
    steps: Math.max(1, Math.round(options.iterations ?? 3 + time * 5)),
    distance: 0.7 + time * 1.8,
    diffusion: 0.08 + humidity * 0.12,
    dissipation: 0.01 + temperature * sunlight * 0.08,
    deposition: 0.03 + salinity * 0.16,
  });
  const growth = makeTexture(size, size, 1);
  const corrosion = makeTexture(size, size, 1);
  const sediment = makeTexture(size, size, 1);
  const wear = makeTexture(size, size, 1);
  const cracking = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const pixel = y * size + x;
      const wet = transport.field.data[pixel]!;
      const deposit = transport.deposited.data[pixel]!;
      const micro = fbm3(noise, u * 12, v * 12, time * 5 + 7, { octaves: 3 }) * 0.5 + 0.5;
      const track = Math.pow(Math.max(0, Math.cos((u - 0.5) * TAU * 2)), 10) * traffic;
      growth.data[pixel] = clamp01(wet * humidity * (1 - sunlight * 0.65) * time * (0.45 + micro * 0.7));
      corrosion.data[pixel] = clamp01(wet * (0.3 + salinity * 0.95) * time * (0.55 + deposit * 0.8));
      sediment.data[pixel] = clamp01(deposit * (0.5 + salinity * 0.5) + (1 - v) * wet * 0.16);
      wear.data[pixel] = clamp01(track * time + sunlight * time * 0.28 + Math.abs(micro - 0.5) * traffic * 0.35);
      cracking.data[pixel] = clamp01(
        smoothstep(0.72, 0.95, 1 - Math.abs(noise.noise3(u * 7, v * 7, time * 0.5)))
        * time * (temperature * 0.5 + sunlight * 0.35 + traffic * 0.45),
      );
    }
  }
  return {
    moisture: transport.field,
    growth,
    corrosion,
    sediment,
    wear,
    cracking,
    flow: velocity,
  };
}

export type SdfDecalShape = "circle" | "box" | "stripe" | "ring";

export interface SdfDecal {
  shape: SdfDecalShape;
  center: readonly [number, number];
  size: readonly [number, number];
  rotation?: number;
  softness?: number;
  opacity?: number;
}

/** Project ordered SDF decals into one tileable coverage map. */
export function projectSdfDecals(size: number, decals: ReadonlyArray<SdfDecal>): TextureBuffer {
  return generate(size, size, 1, (u, v) => {
    let coverage = 0;
    for (const decal of decals) {
      const angle = decal.rotation ?? 0;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const dx = u - decal.center[0];
      const dy = v - decal.center[1];
      const localX = dx * cosine + dy * sine;
      const localY = -dx * sine + dy * cosine;
      const sx = Math.max(1e-4, decal.size[0]);
      const sy = Math.max(1e-4, decal.size[1]);
      let distance: number;
      if (decal.shape === "circle") distance = Math.hypot(localX / sx, localY / sy) - 1;
      else if (decal.shape === "ring") distance = Math.abs(Math.hypot(localX / sx, localY / sy) - 0.72) - 0.18;
      else if (decal.shape === "stripe") distance = Math.abs(localY / sy) - 1 + Math.max(0, Math.abs(localX / sx) - 1);
      else {
        const qx = Math.abs(localX) / sx - 1;
        const qy = Math.abs(localY) / sy - 1;
        distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
      }
      const softness = Math.max(1e-4, decal.softness ?? 0.05);
      const mask = (1 - smoothstep(-softness, softness, distance)) * (decal.opacity ?? 1);
      coverage = coverage + mask * (1 - coverage);
    }
    return clamp01(coverage);
  });
}

export interface TerrainLayerRule {
  minHeight?: number;
  maxHeight?: number;
  minSlope?: number;
  maxSlope?: number;
  moisturePreference?: number;
  sharpness?: number;
}

/** Normalized multi-material weights driven by height, slope and moisture. */
export function computeTerrainBlendWeights(
  height: TextureBuffer,
  slope: TextureBuffer,
  moisture: TextureBuffer,
  rules: ReadonlyArray<TerrainLayerRule>,
): TextureBuffer {
  if (height.channels !== 1 || slope.channels !== 1 || moisture.channels !== 1) {
    throw new Error("terrain inputs must have one channel");
  }
  if (!rules.length) throw new Error("terrain rules must not be empty");
  const weights = makeTexture(height.width, height.height, rules.length);
  for (let pixel = 0; pixel < height.width * height.height; pixel++) {
    let total = 0;
    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index]!;
      const softness = Math.max(0.005, 1 / Math.max(1, rule.sharpness ?? 8));
      const h = height.data[pixel]!;
      const s = slope.data[pixel]!;
      const wet = moisture.data[pixel]!;
      const heightWeight = smoothstep((rule.minHeight ?? 0) - softness, (rule.minHeight ?? 0) + softness, h)
        * (1 - smoothstep((rule.maxHeight ?? 1) - softness, (rule.maxHeight ?? 1) + softness, h));
      const slopeWeight = smoothstep((rule.minSlope ?? 0) - softness, (rule.minSlope ?? 0) + softness, s)
        * (1 - smoothstep((rule.maxSlope ?? 1) - softness, (rule.maxSlope ?? 1) + softness, s));
      const moistureWeight = 1 - Math.abs(wet - (rule.moisturePreference ?? wet));
      const value = Math.max(1e-6, heightWeight * slopeWeight * moistureWeight);
      weights.data[pixel * rules.length + index] = value;
      total += value;
    }
    for (let index = 0; index < rules.length; index++) {
      const weightIndex = pixel * rules.length + index;
      weights.data[weightIndex] = weights.data[weightIndex]! / total;
    }
  }
  return weights;
}

export interface ReferenceFeatures {
  mean: number;
  variance: number;
  edgeEnergy: number;
  highFrequency: number;
  horizontalDirection: number;
  verticalDirection: number;
  histogram: readonly number[];
}

export function extractReferenceFeatures(texture: TextureBuffer, bins = 12): ReferenceFeatures {
  const count = texture.width * texture.height;
  const histogram = new Array<number>(bins).fill(0);
  let sum = 0;
  let squareSum = 0;
  let horizontal = 0;
  let vertical = 0;
  let highFrequency = 0;
  for (let y = 0; y < texture.height; y++) {
    for (let x = 0; x < texture.width; x++) {
      const value = sample(texture, x, y);
      sum += value;
      squareSum += value * value;
      histogram[Math.min(bins - 1, Math.floor(clamp01(value) * bins))]!++;
      const dx = sample(texture, x + 1, y) - sample(texture, x - 1, y);
      const dy = sample(texture, x, y + 1) - sample(texture, x, y - 1);
      horizontal += Math.abs(dx);
      vertical += Math.abs(dy);
      highFrequency += Math.abs(value - (
        sample(texture, x - 1, y) + sample(texture, x + 1, y)
        + sample(texture, x, y - 1) + sample(texture, x, y + 1)
      ) * 0.25);
    }
  }
  const mean = sum / count;
  const variance = squareSum / count - mean * mean;
  const edgeTotal = horizontal + vertical || 1;
  return {
    mean,
    variance,
    edgeEnergy: edgeTotal / count,
    highFrequency: highFrequency / count,
    horizontalDirection: horizontal / edgeTotal,
    verticalDirection: vertical / edgeTotal,
    histogram: histogram.map((value) => value / count),
  };
}

export function scoreReferenceFeatures(left: ReferenceFeatures, right: ReferenceFeatures): number {
  const histogramError = left.histogram.reduce((sum, value, index) => (
    sum + Math.abs(value - (right.histogram[index] ?? 0))
  ), 0) / left.histogram.length;
  return (
    Math.abs(left.mean - right.mean) * 1.2
    + Math.abs(left.variance - right.variance) * 1.8
    + Math.abs(left.edgeEnergy - right.edgeEnergy) * 0.8
    + Math.abs(left.highFrequency - right.highFrequency)
    + Math.abs(left.horizontalDirection - right.horizontalDirection) * 0.45
    + histogramError * 1.5
  );
}

export interface ParameterRange {
  min: number;
  max: number;
}

export interface MultiviewFitOptions {
  seed?: number;
  generations?: number;
  population?: number;
  initial?: Readonly<Record<string, number>>;
}

export interface MultiviewFitResult {
  params: Record<string, number>;
  score: number;
  history: readonly number[];
  viewScores: readonly number[];
}

/** Deterministic evolution-strategy fit over multiple reference views and scales. */
export function fitMaterialMultiview(
  targets: ReadonlyArray<TextureBuffer>,
  ranges: Readonly<Record<string, ParameterRange>>,
  render: (params: Readonly<Record<string, number>>, view: number, scale: number) => TextureBuffer,
  options: MultiviewFitOptions = {},
): MultiviewFitResult {
  if (!targets.length) throw new Error("targets must not be empty");
  const keys = Object.keys(ranges).sort();
  if (!keys.length) throw new Error("ranges must not be empty");
  const rng = makeRng(options.seed ?? 0);
  const generations = Math.max(1, Math.round(options.generations ?? 8));
  const population = Math.max(3, Math.round(options.population ?? 10));
  let center = Object.fromEntries(keys.map((key) => {
    const range = ranges[key]!;
    return [key, options.initial?.[key] ?? (range.min + range.max) * 0.5];
  }));
  let spread = Object.fromEntries(keys.map((key) => [key, (ranges[key]!.max - ranges[key]!.min) * 0.32]));
  let bestParams = { ...center };
  let bestScore = Infinity;
  let bestViewScores: number[] = [];
  const history: number[] = [];
  const targetFeatures = targets.map((target) => extractReferenceFeatures(target));
  const evaluate = (params: Record<string, number>, scale: number) => {
    const viewScores = targets.map((_target, view) => scoreReferenceFeatures(
      targetFeatures[view]!,
      extractReferenceFeatures(render(params, view, scale)),
    ));
    return { params, viewScores, score: viewScores.reduce((sum, value) => sum + value, 0) / viewScores.length };
  };
  for (let generation = 0; generation < generations; generation++) {
    const scale = generation < generations / 2 ? 0.5 : 1;
    const candidates = Array.from({ length: population }, (_, candidateIndex) => {
      const params: Record<string, number> = {};
      for (const key of keys) {
        const range = ranges[key]!;
        const jitter = candidateIndex === 0 ? 0 : (rng.next() + rng.next() + rng.next() - 1.5) * spread[key]!;
        params[key] = clamp(center[key]! + jitter, range.min, range.max);
      }
      return evaluate(params, scale);
    }).sort((left, right) => left.score - right.score);
    const winner = candidates[0]!;
    center = { ...winner.params };
    for (const key of keys) spread[key] = Math.max((ranges[key]!.max - ranges[key]!.min) * 0.005, spread[key]! * 0.62);
    if (winner.score < bestScore) {
      bestScore = winner.score;
      bestParams = { ...winner.params };
      bestViewScores = [...winner.viewScores];
    }
    history.push(bestScore);
  }
  for (const key of keys) {
    const range = ranges[key]!;
    for (let sampleIndex = 0; sampleIndex <= 20; sampleIndex++) {
      const params = { ...bestParams, [key]: range.min + (range.max - range.min) * sampleIndex / 20 };
      const candidate = evaluate(params, 1);
      if (candidate.score < bestScore) {
        bestScore = candidate.score;
        bestParams = { ...candidate.params };
        bestViewScores = [...candidate.viewScores];
      }
    }
  }
  history.push(bestScore);
  return { params: bestParams, score: bestScore, history, viewScores: bestViewScores };
}

export interface ReplicationReport {
  material: string;
  parameters: Readonly<Record<string, number>>;
  score: number;
  viewScores: readonly number[];
  errors: readonly string[];
  summary: string;
}

export function createReplicationReport(
  material: string,
  fit: MultiviewFitResult,
  tolerance = 0.12,
): ReplicationReport {
  const errors: string[] = [];
  fit.viewScores.forEach((score, index) => {
    if (score > tolerance) errors.push(`view ${index} score ${score.toFixed(4)} exceeds ${tolerance}`);
  });
  return {
    material,
    parameters: { ...fit.params },
    score: fit.score,
    viewScores: [...fit.viewScores],
    errors,
    summary: errors.length === 0
      ? `${material}: fit accepted at ${fit.score.toFixed(4)}`
      : `${material}: ${errors.length} view(s) require refinement`,
  };
}

export function serializeReplicationReport(report: ReplicationReport): string {
  return JSON.stringify(report, null, 2);
}

export function makeFlowField(
  size: number,
  seed: number,
  direction: readonly [number, number],
  turbulence = 0.25,
): TextureBuffer {
  const noise = makeNoise(seed);
  const baseAngle = Math.atan2(direction[1], direction[0]);
  return generate(size, size, 2, (u, v) => {
    const angle = baseAngle + noise.noise3(u * 4, v * 4, seed * 0.01) * turbulence;
    return [Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5];
  });
}

export function mixRgb(left: RGB, right: RGB, amount: number): RGB {
  const value = clamp01(amount);
  return [
    left[0] + (right[0] - left[0]) * value,
    left[1] + (right[1] - left[1]) * value,
    left[2] + (right[2] - left[2]) * value,
  ];
}

export function constantSceneAttributes(size: number): SceneAttributeBake {
  return {
    ao: flatTexture(size, 1),
    curvature: flatTexture(size, 0.5),
    thickness: flatTexture(size, 0.5),
    slope: flatTexture(size, 0.5),
    height: flatTexture(size, 0.5),
    worldPosition: generate(size, size, 3, (u, v) => [u, 0.5, v]),
    coverage: flatTexture(size, 1),
  };
}
