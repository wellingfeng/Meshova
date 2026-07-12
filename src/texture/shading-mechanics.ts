import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import {
  deriveHeightFeatures,
  type ExtendedMaterial,
  type ExtendedMaterialPhysical,
} from "./material-mechanics.js";
import { validateMaterial } from "./pbr.js";

type RGB = [number, number, number];

const clamp01 = (value: number) => clamp(value, 0, 1);

function wrappedIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function wrappedSample(texture: TextureBuffer, x: number, y: number, channel = 0): number {
  const wrappedX = wrappedIndex(x, texture.width);
  const wrappedY = wrappedIndex(y, texture.height);
  return texture.data[(wrappedY * texture.width + wrappedX) * texture.channels + channel]!;
}

export interface ReactionDiffusionOptions {
  seed?: number;
  iterations?: number;
  diffusionA?: number;
  diffusionB?: number;
  feed?: number;
  kill?: number;
  spots?: number;
}

export interface ReactionDiffusionResult {
  activator: TextureBuffer;
  inhibitor: TextureBuffer;
  pattern: TextureBuffer;
}

export function reactionDiffusion(
  size: number,
  options: ReactionDiffusionOptions = {},
): ReactionDiffusionResult {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const rng = makeRng(options.seed ?? 0);
  const iterations = Math.max(1, Math.round(options.iterations ?? 64));
  const diffusionA = options.diffusionA ?? 1;
  const diffusionB = options.diffusionB ?? 0.5;
  const feed = options.feed ?? 0.055;
  const kill = options.kill ?? 0.062;
  let activator = makeTexture(size, size, 1);
  let inhibitor = makeTexture(size, size, 1);
  activator.data.fill(1);
  const spots = Math.max(1, Math.round(options.spots ?? Math.max(3, size / 10)));
  for (let spot = 0; spot < spots; spot++) {
    const centerX = rng.int(0, size - 1);
    const centerY = rng.int(0, size - 1);
    const radius = rng.range(Math.max(1.5, size * 0.025), Math.max(2.5, size * 0.075));
    for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y++) {
      for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
        const dx = Math.min(Math.abs(x - centerX), size - Math.abs(x - centerX));
        const dy = Math.min(Math.abs(y - centerY), size - Math.abs(y - centerY));
        if (Math.hypot(dx, dy) > radius) continue;
        const index = wrappedIndex(y, size) * size + wrappedIndex(x, size);
        activator.data[index] = rng.range(0.42, 0.58);
        inhibitor.data[index] = rng.range(0.82, 1);
      }
    }
  }
  const laplacian = (texture: TextureBuffer, x: number, y: number): number => (
    -wrappedSample(texture, x, y)
    + (wrappedSample(texture, x - 1, y) + wrappedSample(texture, x + 1, y)
      + wrappedSample(texture, x, y - 1) + wrappedSample(texture, x, y + 1)) * 0.2
    + (wrappedSample(texture, x - 1, y - 1) + wrappedSample(texture, x + 1, y - 1)
      + wrappedSample(texture, x - 1, y + 1) + wrappedSample(texture, x + 1, y + 1)) * 0.05
  );
  for (let iteration = 0; iteration < iterations; iteration++) {
    const nextA = makeTexture(size, size, 1);
    const nextB = makeTexture(size, size, 1);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        const a = activator.data[index]!;
        const b = inhibitor.data[index]!;
        const reaction = a * b * b;
        nextA.data[index] = clamp01(a + diffusionA * laplacian(activator, x, y) - reaction + feed * (1 - a));
        nextB.data[index] = clamp01(b + diffusionB * laplacian(inhibitor, x, y) + reaction - (kill + feed) * b);
      }
    }
    activator = nextA;
    inhibitor = nextB;
  }
  const pattern = makeTexture(size, size, 1);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of inhibitor.data) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = Math.max(1e-6, maximum - minimum);
  for (let index = 0; index < pattern.data.length; index++) {
    pattern.data[index] = clamp01((inhibitor.data[index]! - minimum) / range);
  }
  return { activator, inhibitor, pattern };
}

export interface CrackGrowthOptions {
  seed?: number;
  starts?: number;
  steps?: number;
  branchChance?: number;
  turn?: number;
  width?: number;
}

export interface CrackGrowthResult {
  crack: TextureBuffer;
  hierarchy: TextureBuffer;
  edgeLift: TextureBuffer;
}

interface CrackWalker {
  x: number;
  y: number;
  angle: number;
  energy: number;
  level: number;
}

export function growCracks(size: number, options: CrackGrowthOptions = {}): CrackGrowthResult {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const rng = makeRng(options.seed ?? 0);
  const crack = makeTexture(size, size, 1);
  const hierarchy = makeTexture(size, size, 1);
  const starts = Math.max(1, Math.round(options.starts ?? Math.max(2, size / 24)));
  const maxSteps = Math.max(4, Math.round(options.steps ?? size * 1.8));
  const branchChance = clamp01(options.branchChance ?? 0.035);
  const turn = Math.max(0, options.turn ?? 0.22);
  const width = Math.max(0.6, options.width ?? 1.2);
  const walkers: CrackWalker[] = [];
  for (let start = 0; start < starts; start++) {
    walkers.push({
      x: rng.range(0, size),
      y: rng.range(0, size),
      angle: rng.range(0, TAU),
      energy: maxSteps * rng.range(0.7, 1),
      level: 0,
    });
  }
  let cursor = 0;
  while (cursor < walkers.length && cursor < starts * 12) {
    const walker = walkers[cursor++]!;
    for (let step = 0; step < walker.energy; step++) {
      const radius = width * Math.max(0.45, 1 - walker.level * 0.18);
      const centerX = Math.round(walker.x);
      const centerY = Math.round(walker.y);
      for (let offsetY = -Math.ceil(radius); offsetY <= Math.ceil(radius); offsetY++) {
        for (let offsetX = -Math.ceil(radius); offsetX <= Math.ceil(radius); offsetX++) {
          const distance = Math.hypot(offsetX, offsetY);
          if (distance > radius + 0.5) continue;
          const x = wrappedIndex(centerX + offsetX, size);
          const y = wrappedIndex(centerY + offsetY, size);
          const index = y * size + x;
          const strength = clamp01(1 - distance / (radius + 0.5));
          crack.data[index] = Math.max(crack.data[index]!, strength);
          hierarchy.data[index] = Math.max(hierarchy.data[index]!, 1 - walker.level / 6);
        }
      }
      if (walker.level < 5 && rng.next() < branchChance) {
        walkers.push({
          x: walker.x,
          y: walker.y,
          angle: walker.angle + rng.range(0.55, 1.1) * (rng.next() < 0.5 ? -1 : 1),
          energy: Math.max(4, (walker.energy - step) * rng.range(0.3, 0.62)),
          level: walker.level + 1,
        });
      }
      walker.angle += rng.range(-turn, turn);
      walker.x = wrappedIndex(walker.x + Math.cos(walker.angle), size);
      walker.y = wrappedIndex(walker.y + Math.sin(walker.angle), size);
      if (rng.next() < 0.008 + walker.level * 0.006) break;
    }
  }
  const edgeLift = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const center = crack.data[index]!;
      let nearby = 0;
      for (let offsetY = -2; offsetY <= 2; offsetY++) {
        for (let offsetX = -2; offsetX <= 2; offsetX++) {
          nearby = Math.max(nearby, wrappedSample(crack, x + offsetX, y + offsetY));
        }
      }
      edgeLift.data[index] = clamp01(nearby - center * 0.82);
    }
  }
  return { crack, hierarchy, edgeLift };
}

export interface ThicknessFieldOptions {
  threshold?: number;
  maximum?: number;
  height?: TextureBuffer;
  heightInfluence?: number;
}

export function buildThicknessField(
  mask: TextureBuffer,
  options: ThicknessFieldOptions = {},
): TextureBuffer {
  if (mask.channels !== 1) throw new Error("mask must be single-channel");
  const threshold = clamp01(options.threshold ?? 0.5);
  const maximum = Math.max(0, options.maximum ?? 1);
  const heightInfluence = clamp01(options.heightInfluence ?? 0.35);
  const count = mask.width * mask.height;
  const distances = new Float32Array(count);
  const limit = mask.width + mask.height;
  for (let index = 0; index < count; index++) distances[index] = mask.data[index]! >= threshold ? limit : 0;
  const relax = (x: number, y: number, offsets: ReadonlyArray<readonly [number, number, number]>) => {
    const index = y * mask.width + x;
    if (distances[index] === 0) return;
    let distance = distances[index]!;
    for (const [offsetX, offsetY, cost] of offsets) {
      const neighborX = wrappedIndex(x + offsetX, mask.width);
      const neighborY = wrappedIndex(y + offsetY, mask.height);
      distance = Math.min(distance, distances[neighborY * mask.width + neighborX]! + cost);
    }
    distances[index] = distance;
  };
  const forward = [[-1, 0, 1], [0, -1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]] as const;
  const backward = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]] as const;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) relax(x, y, forward);
    for (let y = mask.height - 1; y >= 0; y--) for (let x = mask.width - 1; x >= 0; x--) relax(x, y, backward);
  }
  let maxDistance = 1;
  for (const distance of distances) if (distance < limit) maxDistance = Math.max(maxDistance, distance);
  const thickness = makeTexture(mask.width, mask.height, 1);
  for (let index = 0; index < count; index++) {
    const shape = distances[index]! >= limit ? 1 : distances[index]! / maxDistance;
    const height = options.height?.data[index] ?? 0.5;
    thickness.data[index] = clamp01((shape * (1 - heightInfluence) + height * heightInfluence) * maximum * mask.data[index]!);
  }
  return thickness;
}

export function beerLambertAbsorption(
  color: RGB,
  thickness: TextureBuffer,
  absorption: RGB,
): TextureBuffer {
  if (thickness.channels !== 1) throw new Error("thickness must be single-channel");
  const output = makeTexture(thickness.width, thickness.height, 3);
  for (let pixel = 0; pixel < thickness.width * thickness.height; pixel++) {
    const depth = thickness.data[pixel]!;
    for (let channel = 0; channel < 3; channel++) {
      output.data[pixel * 3 + channel] = clamp01(color[channel]! * Math.exp(-Math.max(0, absorption[channel]!) * depth));
    }
  }
  return output;
}

export interface ThinFilmOptions {
  ior?: number;
  phase?: number;
  strength?: number;
}

export function thinFilmInterference(
  thickness: TextureBuffer,
  options: ThinFilmOptions = {},
): TextureBuffer {
  if (thickness.channels !== 1) throw new Error("thickness must be single-channel");
  const ior = clamp(options.ior ?? 1.45, 1, 3);
  const phase = options.phase ?? 0;
  const strength = clamp01(options.strength ?? 1);
  const wavelengths: RGB = [650, 510, 440];
  const output = makeTexture(thickness.width, thickness.height, 3);
  for (let pixel = 0; pixel < thickness.width * thickness.height; pixel++) {
    const nanometers = 80 + thickness.data[pixel]! * 820;
    for (let channel = 0; channel < 3; channel++) {
      const interference = 0.5 + 0.5 * Math.cos((4 * Math.PI * ior * nanometers) / wavelengths[channel]! + phase);
      output.data[pixel * 3 + channel] = clamp01((1 - strength) * 0.5 + interference * strength);
    }
  }
  return output;
}

export interface WeatheringOptions {
  seed?: number;
  iterations?: number;
  rainfall?: number;
  evaporation?: number;
  porosity?: number;
  salt?: number;
  mold?: number;
}

export interface WeatheringResult {
  moisture: TextureBuffer;
  salt: TextureBuffer;
  mold: TextureBuffer;
  peel: TextureBuffer;
}

export function weatheringTransport(
  height: TextureBuffer,
  options: WeatheringOptions = {},
): WeatheringResult {
  if (height.channels !== 1) throw new Error("height must be single-channel");
  const features = deriveHeightFeatures(height, { slopeStrength: 9, cavityStrength: 14 });
  const noise = makeNoise(options.seed ?? 0);
  const iterations = Math.max(1, Math.round(options.iterations ?? 12));
  const rainfall = clamp01(options.rainfall ?? 0.72);
  const evaporation = clamp01(options.evaporation ?? 0.16);
  const porosity = clamp01(options.porosity ?? 0.58);
  let moisture = makeTexture(height.width, height.height, 1);
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      const index = y * height.width + x;
      const variation = fbm2(noise, x / height.width * 5, y / height.height * 5, { octaves: 3 }) * 0.5 + 0.5;
      moisture.data[index] = clamp01(rainfall * (0.24 + features.flow.data[index]! * 0.52 + features.cavity.data[index]! * 0.24) * (0.65 + variation * 0.35));
    }
  }
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = makeTexture(height.width, height.height, 1);
    for (let y = 0; y < height.height; y++) {
      for (let x = 0; x < height.width; x++) {
        const index = y * height.width + x;
        const neighborMean = (
          sample(moisture, x - 1, y) + sample(moisture, x + 1, y)
          + sample(moisture, x, y - 1) + sample(moisture, x, y + 1)
        ) * 0.25;
        const retained = moisture.data[index]! * (1 - evaporation * (0.45 + features.slope.data[index]! * 0.55));
        const seepage = neighborMean * porosity * (0.35 + features.cavity.data[index]! * 0.65);
        next.data[index] = clamp01(retained * (1 - porosity * 0.22) + seepage * 0.42 + features.flow.data[index]! * rainfall * 0.035);
      }
    }
    moisture = next;
  }
  const salt = makeTexture(height.width, height.height, 1);
  const mold = makeTexture(height.width, height.height, 1);
  const peel = makeTexture(height.width, height.height, 1);
  const saltAmount = clamp01(options.salt ?? 0.68);
  const moldAmount = clamp01(options.mold ?? 0.62);
  for (let index = 0; index < height.data.length; index++) {
    const wet = moisture.data[index]!;
    const dryingFront = clamp01(wet * (1 - wet) * 4);
    salt.data[index] = clamp01((dryingFront * 0.72 + features.sediment.data[index]! * 0.28) * saltAmount);
    mold.data[index] = clamp01(smoothstep(0.24, 0.72, wet) * (0.58 + features.cavity.data[index]! * 0.42) * moldAmount);
    peel.data[index] = clamp01((salt.data[index]! * 0.62 + dryingFront * features.edge.data[index]! * 0.7) * (0.55 + porosity * 0.45));
  }
  return { moisture, salt, mold, peel };
}

export interface FiberTensorOptions {
  seed?: number;
  angle?: number;
  scale?: number;
  turbulence?: number;
  crossWeave?: number;
}

export interface FiberTensorResult {
  tensor: TextureBuffer;
  direction: TextureBuffer;
  anisotropy: TextureBuffer;
  crossing: TextureBuffer;
}

export function makeFiberTensorField(
  size: number,
  options: FiberTensorOptions = {},
): FiberTensorResult {
  const noise = makeNoise(options.seed ?? 0);
  const baseAngle = options.angle ?? 0;
  const scale = Math.max(0.1, options.scale ?? 7);
  const turbulence = Math.max(0, options.turbulence ?? 0.32);
  const crossWeave = clamp01(options.crossWeave ?? 0);
  const tensor = makeTexture(size, size, 3);
  const direction = makeTexture(size, size, 2);
  const anisotropy = makeTexture(size, size, 1);
  const crossing = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const warp = fbm2(noise, u * scale, v * scale, { octaves: 4 }) * turbulence;
      const weave = crossWeave * (0.5 + 0.5 * Math.sin((u + v) * scale * TAU));
      const angle = baseAngle + warp + weave * Math.PI * 0.5;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const index = y * size + x;
      direction.data[index * 2] = directionX * 0.5 + 0.5;
      direction.data[index * 2 + 1] = directionY * 0.5 + 0.5;
      tensor.data[index * 3] = directionX * directionX;
      tensor.data[index * 3 + 1] = directionX * directionY * 0.5 + 0.5;
      tensor.data[index * 3 + 2] = directionY * directionY;
      anisotropy.data[index] = clamp01(0.68 + Math.abs(warp) * 0.28 - weave * 0.18);
      crossing.data[index] = weave;
    }
  }
  return { tensor, direction, anisotropy, crossing };
}

export interface TextureQualityReport {
  horizontalSeam: number;
  verticalSeam: number;
  maximumSeam: number;
  mipStability: number;
}

export function analyzeTextureQuality(texture: TextureBuffer): TextureQualityReport {
  let horizontal = 0;
  let vertical = 0;
  let horizontalCount = 0;
  let verticalCount = 0;
  for (let y = 0; y < texture.height; y++) {
    for (let channel = 0; channel < texture.channels; channel++) {
      horizontal += Math.abs(sample(texture, 0, y, channel) - sample(texture, texture.width - 1, y, channel));
      horizontalCount++;
    }
  }
  for (let x = 0; x < texture.width; x++) {
    for (let channel = 0; channel < texture.channels; channel++) {
      vertical += Math.abs(sample(texture, x, 0, channel) - sample(texture, x, texture.height - 1, channel));
      verticalCount++;
    }
  }
  let mean = 0;
  for (const value of texture.data) mean += value;
  mean /= Math.max(1, texture.data.length);
  let variance = 0;
  for (const value of texture.data) variance += (value - mean) ** 2;
  variance /= Math.max(1, texture.data.length);
  let coarseVariance = 0;
  let coarseMean = 0;
  let coarseCount = 0;
  const coarseValues: number[] = [];
  for (let y = 0; y < texture.height - 1; y += 2) {
    for (let x = 0; x < texture.width - 1; x += 2) {
      for (let channel = 0; channel < texture.channels; channel++) {
        const value = (
          sample(texture, x, y, channel) + sample(texture, x + 1, y, channel)
          + sample(texture, x, y + 1, channel) + sample(texture, x + 1, y + 1, channel)
        ) * 0.25;
        coarseValues.push(value);
        coarseMean += value;
        coarseCount++;
      }
    }
  }
  coarseMean /= Math.max(1, coarseCount);
  for (const value of coarseValues) coarseVariance += (value - coarseMean) ** 2;
  coarseVariance /= Math.max(1, coarseCount);
  const horizontalSeam = horizontal / Math.max(1, horizontalCount);
  const verticalSeam = vertical / Math.max(1, verticalCount);
  return {
    horizontalSeam,
    verticalSeam,
    maximumSeam: Math.max(horizontalSeam, verticalSeam),
    mipStability: variance <= 1e-8 ? 1 : clamp01(coarseVariance / variance),
  };
}

export function validateTextureQuality(
  texture: TextureBuffer,
  options: { seamTolerance?: number; minimumMipStability?: number } = {},
): string[] {
  const report = analyzeTextureQuality(texture);
  const problems: string[] = [];
  const seamTolerance = options.seamTolerance ?? 0.18;
  const minimumMipStability = options.minimumMipStability ?? 0.08;
  if (report.horizontalSeam > seamTolerance) problems.push(`horizontal seam ${report.horizontalSeam.toFixed(4)} exceeds ${seamTolerance}`);
  if (report.verticalSeam > seamTolerance) problems.push(`vertical seam ${report.verticalSeam.toFixed(4)} exceeds ${seamTolerance}`);
  if (report.mipStability < minimumMipStability) problems.push(`mip stability ${report.mipStability.toFixed(4)} below ${minimumMipStability}`);
  return problems;
}

export interface LayeredMaterialPhysical extends ExtendedMaterialPhysical {
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  iridescence: number;
  iridescenceIor: number;
  subsurface: number;
  attenuationDistance: number;
  attenuationColor: RGB;
  /** Chromatic dispersion amount for transmissive materials. */
  dispersion?: number;
}

export interface LayeredMaterial extends ExtendedMaterial {
  clearcoat: TextureBuffer;
  clearcoatRoughness: TextureBuffer;
  sheen: TextureBuffer;
  sheenColor: TextureBuffer;
  thicknessMap: TextureBuffer;
  subsurface: TextureBuffer;
  iridescence: TextureBuffer;
  iridescenceThickness: TextureBuffer;
  physical: LayeredMaterialPhysical;
}

export interface LayeredMaterialMaps {
  clearcoat?: TextureBuffer;
  clearcoatRoughness?: TextureBuffer;
  sheen?: TextureBuffer;
  sheenColor?: TextureBuffer;
  thicknessMap?: TextureBuffer;
  subsurface?: TextureBuffer;
  iridescence?: TextureBuffer;
  iridescenceThickness?: TextureBuffer;
}

function flatMap(size: number, value: number, channels = 1): TextureBuffer {
  const texture = makeTexture(size, size, channels);
  texture.data.fill(value);
  return texture;
}

export function assembleLayeredMaterial(
  base: ExtendedMaterial,
  maps: LayeredMaterialMaps = {},
  physical: Partial<LayeredMaterialPhysical> = {},
): LayeredMaterial {
  const size = base.height.width;
  return {
    ...base,
    clearcoat: maps.clearcoat ?? flatMap(size, 0),
    clearcoatRoughness: maps.clearcoatRoughness ?? flatMap(size, 0.1),
    sheen: maps.sheen ?? flatMap(size, 0),
    sheenColor: maps.sheenColor ?? flatMap(size, 1, 3),
    thicknessMap: maps.thicknessMap ?? flatMap(size, base.physical.thickness),
    subsurface: maps.subsurface ?? flatMap(size, 0),
    iridescence: maps.iridescence ?? flatMap(size, 0),
    iridescenceThickness: maps.iridescenceThickness ?? flatMap(size, 0.5),
    physical: {
      ...base.physical,
      clearcoat: physical.clearcoat ?? 0,
      clearcoatRoughness: physical.clearcoatRoughness ?? 0.1,
      sheen: physical.sheen ?? 0,
      sheenRoughness: physical.sheenRoughness ?? 0.5,
      iridescence: physical.iridescence ?? 0,
      iridescenceIor: physical.iridescenceIor ?? 1.3,
      subsurface: physical.subsurface ?? 0,
      attenuationDistance: physical.attenuationDistance ?? 1,
      attenuationColor: physical.attenuationColor ?? [1, 1, 1],
      ...physical,
    },
  };
}

export function validateLayeredMaterial(material: LayeredMaterial): string[] {
  const problems = validateMaterial(material);
  const scalarMaps = [
    [material.opacity, "opacity"],
    [material.transmission, "transmission"],
    [material.anisotropy, "anisotropy"],
    [material.anisotropyRotation, "anisotropyRotation"],
    [material.clearcoat, "clearcoat"],
    [material.clearcoatRoughness, "clearcoatRoughness"],
    [material.sheen, "sheen"],
    [material.thicknessMap, "thicknessMap"],
    [material.subsurface, "subsurface"],
    [material.iridescence, "iridescence"],
    [material.iridescenceThickness, "iridescenceThickness"],
  ] as const;
  for (const [map, name] of scalarMaps) {
    if (map.width !== material.height.width || map.height !== material.height.height || map.channels !== 1) {
      problems.push(`${name} shape mismatch`);
      continue;
    }
    for (const value of map.data) {
      if (value < -1e-4 || value > 1 + 1e-4) {
        problems.push(`${name} out of [0,1]`);
        break;
      }
    }
  }
  if (material.sheenColor.channels !== 3) problems.push("sheenColor shape mismatch");
  for (const value of material.sheenColor.data) {
    if (value < -1e-4 || value > 1 + 1e-4) {
      problems.push("sheenColor out of [0,1]");
      break;
    }
  }
  const physical = material.physical;
  if (physical.clearcoat < 0 || physical.clearcoat > 1) problems.push("clearcoat out of [0,1]");
  if (physical.sheen < 0 || physical.sheen > 1) problems.push("sheen out of [0,1]");
  if (physical.iridescence < 0 || physical.iridescence > 1) problems.push("iridescence out of [0,1]");
  if (physical.subsurface < 0 || physical.subsurface > 1) problems.push("subsurface out of [0,1]");
  if (physical.dispersion !== undefined && (physical.dispersion < 0 || physical.dispersion > 1)) problems.push("dispersion out of [0,1]");
  if (physical.iridescenceIor < 1 || physical.iridescenceIor > 3) problems.push("iridescenceIor out of [1,3]");
  if (physical.attenuationDistance <= 0) problems.push("attenuationDistance must be positive");
  return problems;
}
