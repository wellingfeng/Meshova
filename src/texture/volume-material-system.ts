import { clamp, TAU } from "../math/scalar.js";
import { dot, normalize, type Vec3 } from "../math/vec3.js";
import { fbm3, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";

type RGB = readonly [number, number, number];

const clamp01 = (value: number): number => clamp(value, 0, 1);

export interface VolumeField {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly density: Float32Array;
  readonly temperature: Float32Array;
  readonly humidity: Float32Array;
  /** XYZ velocity, interleaved per voxel. */
  readonly velocity: Float32Array;
}

export interface ProceduralVolumeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly seed?: number;
  readonly scale?: number;
  readonly detail?: number;
  readonly density?: number;
  readonly temperature?: number;
  readonly humidity?: number;
  readonly buoyancy?: number;
  readonly wind?: Vec3;
  readonly shape?: "box" | "sphere" | "layer" | "plume";
}

/** Build deterministic density, temperature, humidity and velocity volumes. */
export function createProceduralVolume(options: ProceduralVolumeOptions = {}): VolumeField {
  const width = positiveDimension(options.width ?? 16, "width");
  const height = positiveDimension(options.height ?? width, "height");
  const depth = positiveDimension(options.depth ?? width, "depth");
  const count = width * height * depth;
  const density = new Float32Array(count);
  const temperature = new Float32Array(count);
  const humidity = new Float32Array(count);
  const velocity = new Float32Array(count * 3);
  const noise = makeNoise(options.seed ?? 0);
  const detailNoise = makeNoise((options.seed ?? 0) + 97);
  const frequency = Math.max(0.01, options.scale ?? 3.5);
  const octaves = Math.max(1, Math.round(options.detail ?? 4));
  const densityScale = Math.max(0, options.density ?? 0.8);
  const baseTemperature = clamp01(options.temperature ?? 0.15);
  const baseHumidity = clamp01(options.humidity ?? 0.65);
  const buoyancy = options.buoyancy ?? 0.25;
  const wind = options.wind ?? { x: 0.12, y: 0, z: 0.04 };
  const shape = options.shape ?? "sphere";

  for (let z = 0; z < depth; z++) {
    const w = (z + 0.5) / depth;
    for (let y = 0; y < height; y++) {
      const v = (y + 0.5) / height;
      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width;
        const index = volumeIndex(width, height, x, y, z);
        const macro = fbm3(noise, u * frequency, v * frequency, w * frequency, {
          octaves,
          lacunarity: 2,
          gain: 0.52,
        }) * 0.5 + 0.5;
        const detail = fbm3(detailNoise, u * frequency * 3.7, v * frequency * 3.7, w * frequency * 3.7, {
          octaves: Math.max(2, octaves - 1),
          lacunarity: 2.1,
          gain: 0.48,
        }) * 0.5 + 0.5;
        const envelope = volumeEnvelope(shape, u, v, w);
        const body = clamp01((macro * 0.76 + detail * 0.24 - 0.38) * 2.25) * envelope;
        const heat = clamp01(baseTemperature + body * (shape === "plume" ? 0.8 : 0.18));
        density[index] = clamp01(body * densityScale);
        temperature[index] = heat;
        humidity[index] = clamp01(baseHumidity * (0.55 + body * 0.45));
        const curlX = detailNoise.noise3(u * frequency + 19.1, v * frequency, w * frequency) * 0.1;
        const curlZ = detailNoise.noise3(u * frequency, v * frequency + 31.7, w * frequency) * 0.1;
        velocity[index * 3] = wind.x + curlX;
        velocity[index * 3 + 1] = wind.y + heat * buoyancy;
        velocity[index * 3 + 2] = wind.z + curlZ;
      }
    }
  }
  return { width, height, depth, density, temperature, humidity, velocity };
}

export interface VolumeEvolutionOptions {
  readonly timeStep?: number;
  readonly dissipation?: number;
  readonly cooling?: number;
  readonly evaporation?: number;
  readonly buoyancy?: number;
  readonly combustion?: number;
}

/** One periodic semi-Lagrangian volume step. Inputs remain unchanged. */
export function evolveVolume(
  field: VolumeField,
  options: VolumeEvolutionOptions = {},
): VolumeField {
  validateVolume(field);
  const timeStep = Math.max(0, options.timeStep ?? 0.35);
  const dissipation = clamp01(options.dissipation ?? 0.025);
  const cooling = clamp01(options.cooling ?? 0.035);
  const evaporation = clamp01(options.evaporation ?? 0.02);
  const buoyancy = options.buoyancy ?? 0.22;
  const combustion = clamp01(options.combustion ?? 0);
  const count = field.width * field.height * field.depth;
  const density = new Float32Array(count);
  const temperature = new Float32Array(count);
  const humidity = new Float32Array(count);
  const velocity = new Float32Array(count * 3);

  for (let z = 0; z < field.depth; z++) {
    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) {
        const index = volumeIndex(field.width, field.height, x, y, z);
        const vx = field.velocity[index * 3]!;
        const vy = field.velocity[index * 3 + 1]!;
        const vz = field.velocity[index * 3 + 2]!;
        const px = x - vx * timeStep * field.width;
        const py = y - vy * timeStep * field.height;
        const pz = z - vz * timeStep * field.depth;
        const sampledDensity = sampleVolumeChannel(field, field.density, px, py, pz);
        const sampledTemperature = sampleVolumeChannel(field, field.temperature, px, py, pz);
        const sampledHumidity = sampleVolumeChannel(field, field.humidity, px, py, pz);
        const fuel = sampledDensity * sampledTemperature * combustion;
        density[index] = clamp01(sampledDensity * (1 - dissipation) + fuel * 0.08);
        temperature[index] = clamp01(sampledTemperature * (1 - cooling) + fuel * 0.22);
        humidity[index] = clamp01(sampledHumidity * (1 - evaporation * (0.25 + sampledTemperature * 0.75)));
        velocity[index * 3] = vx * (1 - dissipation * 0.25);
        velocity[index * 3 + 1] = vy * (1 - dissipation * 0.25) + sampledTemperature * buoyancy * timeStep;
        velocity[index * 3 + 2] = vz * (1 - dissipation * 0.25);
      }
    }
  }
  return { ...field, density, temperature, humidity, velocity };
}

export interface VolumeRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly length?: number;
}

export interface VolumeIntegrationOptions {
  readonly steps?: number;
  readonly extinction?: number;
  readonly scattering?: number;
  readonly anisotropy?: number;
  readonly lightDirection?: Vec3;
  readonly lightColor?: RGB;
  readonly absorptionColor?: RGB;
  readonly emissionScale?: number;
}

export interface VolumeIntegrationResult {
  readonly color: RGB;
  readonly transmittance: number;
  readonly opticalDepth: number;
  readonly steps: number;
}

/** CPU reference single-scattering integral for GPU regression tests. */
export function integrateVolumeReference(
  field: VolumeField,
  ray: VolumeRay,
  options: VolumeIntegrationOptions = {},
): VolumeIntegrationResult {
  validateVolume(field);
  const steps = Math.max(1, Math.round(options.steps ?? 64));
  const rayLength = Math.max(0, ray.length ?? 1.732);
  const stepLength = rayLength / steps;
  const direction = normalize(ray.direction);
  const lightDirection = normalize(options.lightDirection ?? { x: 0.4, y: 0.8, z: 0.25 });
  const lightColor = options.lightColor ?? [1, 0.96, 0.9];
  const absorptionColor = options.absorptionColor ?? [0.72, 0.82, 1];
  const extinction = Math.max(0, options.extinction ?? 3.2);
  const scattering = Math.max(0, options.scattering ?? 0.82);
  const phase = henyeyGreenstein(dot(direction, lightDirection) * -1, options.anisotropy ?? 0.2);
  const emissionScale = Math.max(0, options.emissionScale ?? 1.4);
  const color = [0, 0, 0];
  let transmittance = 1;
  let opticalDepth = 0;
  for (let step = 0; step < steps; step++) {
    const distance = (step + 0.5) * stepLength;
    const point = {
      x: ray.origin.x + direction.x * distance,
      y: ray.origin.y + direction.y * distance,
      z: ray.origin.z + direction.z * distance,
    };
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || point.z < 0 || point.z > 1) continue;
    const density = sampleVolume(field, point, "density");
    const temperature = sampleVolume(field, point, "temperature");
    if (density <= 1e-6) continue;
    const localDepth = density * extinction * stepLength;
    const attenuation = Math.exp(-localDepth);
    const blackbody = blackbodyApproximation(900 + temperature * 1800);
    for (let channel = 0; channel < 3; channel++) {
      const scattered = lightColor[channel]! * absorptionColor[channel]! * density * scattering * phase;
      const emitted = blackbody[channel]! * density * temperature * emissionScale;
      color[channel] = color[channel]! + transmittance * (scattered + emitted) * stepLength;
    }
    transmittance *= attenuation;
    opticalDepth += localDepth;
    if (transmittance < 1e-4) break;
  }
  return {
    color: color.map((channel) => Math.max(0, channel)) as unknown as RGB,
    transmittance,
    opticalDepth,
    steps,
  };
}

export const VOLUME_RAYMARCH_WGSL = `
struct VolumePhysical {
  boundsMin: vec3f,
  densityScale: f32,
  boundsMax: vec3f,
  extinction: f32,
  scattering: f32,
  anisotropy: f32,
  emissionScale: f32,
  stepCount: u32,
};

@group(2) @binding(0) var volumeDensity: texture_3d<f32>;
@group(2) @binding(1) var volumeTemperature: texture_3d<f32>;
@group(2) @binding(2) var volumeSampler: sampler;
@group(2) @binding(3) var<uniform> volumePhysical: VolumePhysical;

fn volumePhase(cosTheta: f32, g: f32) -> f32 {
  let gg = g * g;
  return (1.0 - gg) / (12.5663706144 * pow(max(1.0 + gg - 2.0 * g * cosTheta, 1e-4), 1.5));
}

fn integrateVolume(origin: vec3f, direction: vec3f, lightDirection: vec3f) -> vec4f {
  let steps = max(volumePhysical.stepCount, 1u);
  let stepLength = length(volumePhysical.boundsMax - volumePhysical.boundsMin) / f32(steps);
  var color = vec3f(0.0);
  var transmittance = 1.0;
  let phase = volumePhase(dot(-direction, lightDirection), volumePhysical.anisotropy);
  for (var index = 0u; index < steps; index += 1u) {
    let position = origin + direction * (f32(index) + 0.5) * stepLength;
    let uvw = (position - volumePhysical.boundsMin) / (volumePhysical.boundsMax - volumePhysical.boundsMin);
    if (all(uvw >= vec3f(0.0)) && all(uvw <= vec3f(1.0))) {
      let density = textureSampleLevel(volumeDensity, volumeSampler, uvw, 0.0).r * volumePhysical.densityScale;
      let temperature = textureSampleLevel(volumeTemperature, volumeSampler, uvw, 0.0).r;
      let localDepth = density * volumePhysical.extinction * stepLength;
      let scatter = density * volumePhysical.scattering * phase;
      let emission = vec3f(1.0, 0.24, 0.03) * density * temperature * volumePhysical.emissionScale;
      color += transmittance * (vec3f(scatter) + emission) * stepLength;
      transmittance *= exp(-localDepth);
      if (transmittance < 0.0001) { break; }
    }
  }
  return vec4f(color, 1.0 - transmittance);
}
`;

export interface GerstnerWave {
  readonly direction: readonly [number, number];
  readonly amplitude: number;
  readonly wavelength: number;
  readonly speed: number;
  readonly steepness: number;
}

export interface OceanSurfaceSample {
  readonly height: number;
  readonly normal: Vec3;
  readonly velocity: Vec3;
  readonly foam: number;
}

/** Deterministic Gerstner spectrum sample with crest-derived foam seed. */
export function sampleOceanSpectrum(
  x: number,
  z: number,
  time: number,
  waves: readonly GerstnerWave[],
): OceanSurfaceSample {
  if (waves.length === 0) return { height: 0, normal: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, foam: 0 };
  let height = 0;
  let dx = 0;
  let dz = 0;
  let velocityY = 0;
  let compression = 0;
  for (const wave of waves) {
    const length = Math.hypot(wave.direction[0], wave.direction[1]) || 1;
    const directionX = wave.direction[0] / length;
    const directionZ = wave.direction[1] / length;
    const wavelength = Math.max(1e-4, wave.wavelength);
    const k = TAU / wavelength;
    const phase = k * (directionX * x + directionZ * z) - wave.speed * time;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    height += wave.amplitude * sine;
    dx += directionX * wave.amplitude * k * cosine;
    dz += directionZ * wave.amplitude * k * cosine;
    velocityY += -wave.amplitude * wave.speed * cosine;
    compression += Math.max(0, wave.steepness * wave.amplitude * k * sine - 0.22);
  }
  return {
    height,
    normal: normalize({ x: -dx, y: 1, z: -dz }),
    velocity: { x: 0, y: velocityY, z: 0 },
    foam: clamp01(compression),
  };
}

export interface FoamTransportOptions {
  readonly timeStep?: number;
  readonly decay?: number;
  readonly diffusion?: number;
}

/** Periodic 2D foam advection using encoded XY velocity in [0,1]. */
export function transportOceanFoam(
  foam: TextureBuffer,
  velocity: TextureBuffer,
  options: FoamTransportOptions = {},
): TextureBuffer {
  if (foam.channels !== 1) throw new Error("foam must have one channel");
  if (velocity.channels !== 2 || velocity.width !== foam.width || velocity.height !== foam.height) {
    throw new Error("velocity must match foam and have two channels");
  }
  const result = makeTexture(foam.width, foam.height, 1);
  const timeStep = Math.max(0, options.timeStep ?? 0.8);
  const decay = clamp01(options.decay ?? 0.035);
  const diffusion = clamp01(options.diffusion ?? 0.08);
  for (let y = 0; y < foam.height; y++) {
    for (let x = 0; x < foam.width; x++) {
      const pixel = y * foam.width + x;
      const vx = velocity.data[pixel * 2]! * 2 - 1;
      const vy = velocity.data[pixel * 2 + 1]! * 2 - 1;
      const advected = samplePeriodic2D(foam, x - vx * timeStep, y - vy * timeStep);
      const neighbors = (
        samplePeriodic2D(foam, x - 1, y) + samplePeriodic2D(foam, x + 1, y)
        + samplePeriodic2D(foam, x, y - 1) + samplePeriodic2D(foam, x, y + 1)
      ) * 0.25;
      result.data[pixel] = clamp01((advected + (neighbors - advected) * diffusion) * (1 - decay));
    }
  }
  return result;
}

export interface MicroDisplacementOptions {
  readonly worldSpan?: number;
  readonly maxScreenError?: number;
  readonly maxSubdivisions?: number;
  readonly heightScale?: number;
}

export interface MicroDisplacementPlan {
  readonly subdivisions: number;
  readonly tessellationFactor: number;
  readonly maxSlope: number;
  readonly estimatedError: number;
}

/** Estimate adaptive tessellation from height slope and screen error budget. */
export function planMicroDisplacement(
  height: TextureBuffer,
  options: MicroDisplacementOptions = {},
): MicroDisplacementPlan {
  if (height.channels !== 1) throw new Error("height must have one channel");
  const worldSpan = Math.max(1e-6, options.worldSpan ?? 1);
  const heightScale = Math.max(0, options.heightScale ?? 0.1);
  const maxScreenError = Math.max(1e-6, options.maxScreenError ?? 0.002);
  const maxSubdivisions = Math.max(0, Math.floor(options.maxSubdivisions ?? 8));
  let maxSlope = 0;
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      const dx = sampleClamp2D(height, x + 1, y) - sampleClamp2D(height, x - 1, y);
      const dy = sampleClamp2D(height, x, y + 1) - sampleClamp2D(height, x, y - 1);
      maxSlope = Math.max(maxSlope, Math.hypot(dx, dy) * 0.5 * height.width * heightScale / worldSpan);
    }
  }
  const desiredFactor = Math.max(1, Math.sqrt(maxSlope * worldSpan / maxScreenError));
  const subdivisions = Math.min(maxSubdivisions, Math.max(0, Math.ceil(Math.log2(desiredFactor))));
  const tessellationFactor = 2 ** subdivisions;
  return {
    subdivisions,
    tessellationFactor,
    maxSlope,
    estimatedError: maxSlope * worldSpan / Math.max(1, tessellationFactor * tessellationFactor),
  };
}

export function parallaxOcclusionUv(
  height: TextureBuffer,
  uv: readonly [number, number],
  tangentView: Vec3,
  heightScale = 0.05,
  steps = 24,
): readonly [number, number] {
  if (height.channels !== 1) throw new Error("height must have one channel");
  const count = Math.max(1, Math.round(steps));
  const viewZ = Math.max(0.05, Math.abs(tangentView.z));
  const deltaU = tangentView.x / viewZ * heightScale / count;
  const deltaV = tangentView.y / viewZ * heightScale / count;
  let u = uv[0];
  let v = uv[1];
  for (let step = 0; step < count; step++) {
    const layer = (step + 1) / count;
    const surface = sampleUv2D(height, u, v);
    if (layer >= 1 - surface) break;
    u -= deltaU;
    v -= deltaV;
  }
  return [clamp01(u), clamp01(v)];
}

export interface VolumeMipLevel extends VolumeField {
  readonly level: number;
  readonly activeVoxels: number;
}

/** Build ceil-sized multiresolution volume cache; edge voxels remain represented. */
export function buildVolumeMipChain(field: VolumeField, threshold = 1e-4): readonly VolumeMipLevel[] {
  validateVolume(field);
  const levels: VolumeMipLevel[] = [{ ...cloneVolume(field), level: 0, activeVoxels: countActive(field.density, threshold) }];
  while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1 || levels.at(-1)!.depth > 1) {
    const source = levels.at(-1)!;
    const width = Math.max(1, Math.ceil(source.width / 2));
    const height = Math.max(1, Math.ceil(source.height / 2));
    const depth = Math.max(1, Math.ceil(source.depth / 2));
    const next = emptyVolume(width, height, depth);
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let samples = 0;
          const sums = [0, 0, 0, 0, 0, 0];
          for (let oz = 0; oz < 2; oz++) {
            for (let oy = 0; oy < 2; oy++) {
              for (let ox = 0; ox < 2; ox++) {
                const sx = x * 2 + ox;
                const sy = y * 2 + oy;
                const sz = z * 2 + oz;
                if (sx >= source.width || sy >= source.height || sz >= source.depth) continue;
                const sourceIndex = volumeIndex(source.width, source.height, sx, sy, sz);
                sums[0] = sums[0]! + source.density[sourceIndex]!;
                sums[1] = sums[1]! + source.temperature[sourceIndex]!;
                sums[2] = sums[2]! + source.humidity[sourceIndex]!;
                sums[3] = sums[3]! + source.velocity[sourceIndex * 3]!;
                sums[4] = sums[4]! + source.velocity[sourceIndex * 3 + 1]!;
                sums[5] = sums[5]! + source.velocity[sourceIndex * 3 + 2]!;
                samples++;
              }
            }
          }
          const targetIndex = volumeIndex(width, height, x, y, z);
          next.density[targetIndex] = sums[0]! / samples;
          next.temperature[targetIndex] = sums[1]! / samples;
          next.humidity[targetIndex] = sums[2]! / samples;
          next.velocity[targetIndex * 3] = sums[3]! / samples;
          next.velocity[targetIndex * 3 + 1] = sums[4]! / samples;
          next.velocity[targetIndex * 3 + 2] = sums[5]! / samples;
        }
      }
    }
    levels.push({ ...next, level: levels.length, activeVoxels: countActive(next.density, threshold) });
  }
  return levels;
}

export interface TemporalVolumeObservation {
  readonly time: number;
  readonly meanDensity: number;
  readonly meanTemperature: number;
}

export interface TemporalVolumeParameters {
  readonly dissipation: number;
  readonly cooling: number;
  readonly buoyancy: number;
}

export interface TemporalVolumeFit {
  readonly params: TemporalVolumeParameters;
  readonly error: number;
  readonly evaluations: number;
}

/** Fit temporal decay/buoyancy parameters to sequence statistics. */
export function fitTemporalVolume(
  initial: VolumeField,
  observations: readonly TemporalVolumeObservation[],
  candidates = 96,
): TemporalVolumeFit {
  if (observations.length === 0) throw new Error("temporal volume fitting requires observations");
  let evaluations = 0;
  const evaluate = (params: TemporalVolumeParameters): number => {
    evaluations++;
    let field = cloneVolume(initial);
    let previousTime = 0;
    let error = 0;
    for (const observation of [...observations].sort((left, right) => left.time - right.time)) {
      const delta = Math.max(0, observation.time - previousTime);
      field = evolveVolume(field, { timeStep: delta, ...params });
      error += Math.abs(mean(field.density) - observation.meanDensity);
      error += Math.abs(mean(field.temperature) - observation.meanTemperature);
      previousTime = observation.time;
    }
    return error / (observations.length * 2);
  };
  let bestParams: TemporalVolumeParameters = { dissipation: 0.03, cooling: 0.04, buoyancy: 0.2 };
  let bestError = evaluate(bestParams);
  for (let index = 1; index <= Math.max(1, Math.floor(candidates)); index++) {
    const params = {
      dissipation: halton(index, 2) * 0.16,
      cooling: halton(index, 3) * 0.18,
      buoyancy: halton(index, 5) * 0.6,
    };
    const error = evaluate(params);
    if (error < bestError) {
      bestError = error;
      bestParams = params;
    }
  }
  return { params: bestParams, error: bestError, evaluations };
}

export interface VolumeReferenceReport {
  readonly meanDensity: number;
  readonly meanTemperature: number;
  readonly meanHumidity: number;
  readonly meanTransmittance: number;
  readonly meanLuminance: number;
  readonly mipLevels: number;
  readonly activeVoxelRatio: number;
  readonly checksum: string;
}

export function analyzeVolumeReference(field: VolumeField): VolumeReferenceReport {
  validateVolume(field);
  const rays = [0.2, 0.5, 0.8].map((y) => integrateVolumeReference(field, {
    origin: { x: 0, y, z: 0.5 },
    direction: { x: 1, y: 0, z: 0 },
    length: 1,
  }, { steps: Math.max(16, field.width * 2) }));
  const luminance = rays.map((ray) => ray.color[0] * 0.2126 + ray.color[1] * 0.7152 + ray.color[2] * 0.0722);
  const mips = buildVolumeMipChain(field);
  return {
    meanDensity: mean(field.density),
    meanTemperature: mean(field.temperature),
    meanHumidity: mean(field.humidity),
    meanTransmittance: rays.reduce((sum, ray) => sum + ray.transmittance, 0) / rays.length,
    meanLuminance: luminance.reduce((sum, value) => sum + value, 0) / luminance.length,
    mipLevels: mips.length,
    activeVoxelRatio: countActive(field.density, 1e-4) / field.density.length,
    checksum: checksumVolume(field),
  };
}

export function serializeVolumeField(field: VolumeField): Uint8Array {
  validateVolume(field);
  const count = field.width * field.height * field.depth;
  const values = new Float32Array(count * 6);
  for (let index = 0; index < count; index++) {
    values[index * 6] = field.density[index]!;
    values[index * 6 + 1] = field.temperature[index]!;
    values[index * 6 + 2] = field.humidity[index]!;
    values[index * 6 + 3] = field.velocity[index * 3]!;
    values[index * 6 + 4] = field.velocity[index * 3 + 1]!;
    values[index * 6 + 5] = field.velocity[index * 3 + 2]!;
  }
  return new Uint8Array(values.buffer.slice(0));
}

export function sampleVolume(
  field: VolumeField,
  position: Vec3,
  channel: "density" | "temperature" | "humidity",
): number {
  const source = field[channel];
  return sampleVolumeChannel(
    field,
    source,
    clamp01(position.x) * (field.width - 1),
    clamp01(position.y) * (field.height - 1),
    clamp01(position.z) * (field.depth - 1),
  );
}

function positiveDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function volumeEnvelope(shape: NonNullable<ProceduralVolumeOptions["shape"]>, u: number, v: number, w: number): number {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  const dz = (w - 0.5) * 2;
  if (shape === "box") return 1;
  if (shape === "layer") return clamp01(1 - Math.abs(dy) * 1.35);
  if (shape === "plume") {
    const radius = Math.hypot(dx, dz) / Math.max(0.18, 0.68 - v * 0.38);
    return clamp01(1 - radius) * clamp01(v * 4) * clamp01((1 - v) * 2.5);
  }
  return clamp01(1 - Math.hypot(dx, dy, dz));
}

function validateVolume(field: VolumeField): void {
  const count = positiveDimension(field.width, "width") * positiveDimension(field.height, "height") * positiveDimension(field.depth, "depth");
  if (field.density.length !== count || field.temperature.length !== count || field.humidity.length !== count) {
    throw new Error("volume scalar channel size mismatch");
  }
  if (field.velocity.length !== count * 3) throw new Error("volume velocity channel size mismatch");
}

function volumeIndex(width: number, height: number, x: number, y: number, z: number): number {
  return (z * height + y) * width + x;
}

function sampleVolumeChannel(field: VolumeField, source: Float32Array, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;
  let value = 0;
  for (let oz = 0; oz < 2; oz++) {
    const wz = oz ? tz : 1 - tz;
    const iz = wrapIndex(z0 + oz, field.depth);
    for (let oy = 0; oy < 2; oy++) {
      const wy = oy ? ty : 1 - ty;
      const iy = wrapIndex(y0 + oy, field.height);
      for (let ox = 0; ox < 2; ox++) {
        const wx = ox ? tx : 1 - tx;
        const ix = wrapIndex(x0 + ox, field.width);
        value += source[volumeIndex(field.width, field.height, ix, iy, iz)]! * wx * wy * wz;
      }
    }
  }
  return value;
}

function henyeyGreenstein(cosine: number, anisotropy: number): number {
  const g = clamp(anisotropy, -0.95, 0.95);
  const denominator = Math.pow(Math.max(1e-4, 1 + g * g - 2 * g * cosine), 1.5);
  return (1 - g * g) / (4 * Math.PI * denominator);
}

function blackbodyApproximation(kelvin: number): RGB {
  const temperature = clamp(kelvin, 800, 4000);
  const t = (temperature - 800) / 3200;
  return [1, clamp01(t * 1.35), clamp01((t - 0.32) * 1.6)];
}

function samplePeriodic2D(texture: TextureBuffer, x: number, y: number): number {
  const ix = wrapIndex(Math.round(x), texture.width);
  const iy = wrapIndex(Math.round(y), texture.height);
  return texture.data[iy * texture.width + ix]!;
}

function sampleClamp2D(texture: TextureBuffer, x: number, y: number): number {
  const ix = Math.max(0, Math.min(texture.width - 1, x));
  const iy = Math.max(0, Math.min(texture.height - 1, y));
  return texture.data[iy * texture.width + ix]!;
}

function sampleUv2D(texture: TextureBuffer, u: number, v: number): number {
  const x = clamp01(u) * (texture.width - 1);
  const y = (1 - clamp01(v)) * (texture.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(texture.width - 1, x0 + 1);
  const y1 = Math.min(texture.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = sampleClamp2D(texture, x0, y0) * (1 - tx) + sampleClamp2D(texture, x1, y0) * tx;
  const bottom = sampleClamp2D(texture, x0, y1) * (1 - tx) + sampleClamp2D(texture, x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function wrapIndex(value: number, size: number): number {
  return (value % size + size) % size;
}

function emptyVolume(width: number, height: number, depth: number): VolumeField {
  const count = width * height * depth;
  return {
    width,
    height,
    depth,
    density: new Float32Array(count),
    temperature: new Float32Array(count),
    humidity: new Float32Array(count),
    velocity: new Float32Array(count * 3),
  };
}

function cloneVolume(field: VolumeField): VolumeField {
  return {
    width: field.width,
    height: field.height,
    depth: field.depth,
    density: new Float32Array(field.density),
    temperature: new Float32Array(field.temperature),
    humidity: new Float32Array(field.humidity),
    velocity: new Float32Array(field.velocity),
  };
}

function countActive(values: Float32Array, threshold: number): number {
  let active = 0;
  for (const value of values) if (value > threshold) active++;
  return active;
}

function mean(values: Float32Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total / Math.max(1, values.length);
}

function checksumVolume(field: VolumeField): string {
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(field.density.length / 128));
  for (let index = 0; index < field.density.length; index += stride) {
    const value = Math.round(field.density[index]! * 65535) ^ Math.round(field.temperature[index]! * 65535);
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let value = index;
  while (value > 0) {
    fraction /= base;
    result += fraction * (value % base);
    value = Math.floor(value / base);
  }
  return result;
}
