import { clamp, smoothstep } from "../math/scalar.js";
import { makeNoise } from "../random/noise.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import {
  baseColorMap,
  heightToNormal,
  materialFromFields,
  scalarMap,
  validateMaterial,
  type Material,
  type MaterialFields,
} from "./pbr.js";

const clamp01 = (value: number) => clamp(value, 0, 1);

export interface HeightFeatureOptions {
  slopeStrength?: number;
  cavityStrength?: number;
}

export interface HeightFeatures {
  slope: TextureBuffer;
  cavity: TextureBuffer;
  edge: TextureBuffer;
  flow: TextureBuffer;
  sediment: TextureBuffer;
  direction: TextureBuffer;
}

export function deriveHeightFeatures(
  height: TextureBuffer,
  options: HeightFeatureOptions = {},
): HeightFeatures {
  if (height.channels !== 1) throw new Error("height must be single-channel");
  const { width, height: rows } = height;
  const slopeStrength = options.slopeStrength ?? 8;
  const cavityStrength = options.cavityStrength ?? 12;
  const slope = makeTexture(width, rows, 1);
  const cavity = makeTexture(width, rows, 1);
  const edge = makeTexture(width, rows, 1);
  const direction = makeTexture(width, rows, 2);
  const downstream = new Int32Array(width * rows).fill(-1);
  const order = Array.from({ length: width * rows }, (_, index) => index);
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ] as const;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const center = sample(height, x, y);
      const dx = (sample(height, x + 1, y) - sample(height, x - 1, y)) * 0.5;
      const dy = (sample(height, x, y + 1) - sample(height, x, y - 1)) * 0.5;
      const gradient = Math.hypot(dx, dy);
      slope.data[index] = clamp01(gradient * slopeStrength);
      const neighborMean = (
        sample(height, x - 1, y) + sample(height, x + 1, y)
        + sample(height, x, y - 1) + sample(height, x, y + 1)
      ) * 0.25;
      const laplacian = neighborMean - center;
      cavity.data[index] = clamp01(laplacian * cavityStrength + 0.5);
      edge.data[index] = clamp01(Math.abs(laplacian) * cavityStrength + gradient * slopeStrength * 0.35);

      let lowest = center;
      let target = -1;
      let targetX = x;
      let targetY = y;
      for (const [offsetX, offsetY] of offsets) {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= rows) continue;
        const neighbor = sample(height, neighborX, neighborY);
        if (neighbor < lowest - 1e-7) {
          lowest = neighbor;
          target = neighborY * width + neighborX;
          targetX = neighborX;
          targetY = neighborY;
        }
      }
      downstream[index] = target;
      const length = Math.hypot(targetX - x, targetY - y) || 1;
      direction.data[index * 2] = target < 0 ? 0.5 : (targetX - x) / length * 0.5 + 0.5;
      direction.data[index * 2 + 1] = target < 0 ? 0.5 : (targetY - y) / length * 0.5 + 0.5;
    }
  }

  order.sort((left, right) => height.data[right]! - height.data[left]! || left - right);
  const accumulation = new Float32Array(width * rows).fill(1);
  for (const index of order) {
    const target = downstream[index]!;
    if (target >= 0) accumulation[target] = accumulation[target]! + accumulation[index]!;
  }
  let maxAccumulation = 1;
  for (const value of accumulation) maxAccumulation = Math.max(maxAccumulation, value);
  const denominator = Math.log1p(maxAccumulation);
  const flow = makeTexture(width, rows, 1);
  const sediment = makeTexture(width, rows, 1);
  for (let index = 0; index < accumulation.length; index++) {
    const normalized = Math.log1p(accumulation[index]!) / denominator;
    flow.data[index] = clamp01(normalized);
    sediment.data[index] = clamp01(normalized * (1 - slope.data[index]!) * (0.55 + cavity.data[index]! * 0.45));
  }
  return { slope, cavity, edge, flow, sediment, direction };
}

export interface ErosionOptions extends HeightFeatureOptions {
  erosion?: number;
  deposition?: number;
}

export function erodeHeight(
  height: TextureBuffer,
  options: ErosionOptions = {},
): { height: TextureBuffer; features: HeightFeatures } {
  const features = deriveHeightFeatures(height, options);
  const erosion = clamp01(options.erosion ?? 0.18);
  const deposition = clamp01(options.deposition ?? 0.12);
  const output = makeTexture(height.width, height.height, 1);
  for (let index = 0; index < height.data.length; index++) {
    const cut = features.flow.data[index]! * features.slope.data[index]! * erosion;
    const fill = features.sediment.data[index]! * deposition;
    output.data[index] = clamp01(height.data[index]! - cut + fill);
  }
  return { height: output, features: deriveHeightFeatures(output, options) };
}

export interface CoverageMaskOptions extends HeightFeatureOptions {
  level?: number;
  softness?: number;
  slopeLimit?: number;
  slopeSoftness?: number;
  melt?: number;
  wetness?: number;
}

export interface CoverageMasks {
  coverage: TextureBuffer;
  boundary: TextureBuffer;
  wetness: TextureBuffer;
  features: HeightFeatures;
}

export function buildCoverageMasks(
  height: TextureBuffer,
  options: CoverageMaskOptions = {},
): CoverageMasks {
  const features = deriveHeightFeatures(height, options);
  const level = clamp01(options.level ?? 0.52);
  const softness = Math.max(0.001, options.softness ?? 0.12);
  const slopeLimit = clamp01(options.slopeLimit ?? 0.58);
  const slopeSoftness = Math.max(0.001, options.slopeSoftness ?? 0.16);
  const melt = clamp01(options.melt ?? 0);
  const wetnessAmount = clamp01(options.wetness ?? 0.65);
  const coverage = makeTexture(height.width, height.height, 1);
  const boundary = makeTexture(height.width, height.height, 1);
  const wetness = makeTexture(height.width, height.height, 1);

  for (let index = 0; index < height.data.length; index++) {
    const elevation = smoothstep(level - softness, level + softness, height.data[index]!);
    const flatness = 1 - smoothstep(slopeLimit - slopeSoftness, slopeLimit + slopeSoftness, features.slope.data[index]!);
    const rawCoverage = clamp01(elevation * flatness - features.flow.data[index]! * melt * 0.72);
    coverage.data[index] = rawCoverage;
  }
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      const index = y * height.width + x;
      const center = coverage.data[index]!;
      const delta = Math.max(
        Math.abs(center - sample(coverage, x - 1, y)),
        Math.abs(center - sample(coverage, x + 1, y)),
        Math.abs(center - sample(coverage, x, y - 1)),
        Math.abs(center - sample(coverage, x, y + 1)),
      );
      boundary.data[index] = clamp01(delta * 4.5 + center * (1 - center) * 1.8);
      wetness.data[index] = clamp01((features.flow.data[index]! * 0.7 + features.sediment.data[index]! * 0.3 + boundary.data[index]! * melt * 0.5) * wetnessAmount);
    }
  }
  return { coverage, boundary, wetness, features };
}

export type DirectionFieldMode = "linear" | "radial" | "swirl";

export interface DirectionFieldOptions {
  mode?: DirectionFieldMode;
  angle?: number;
  turbulence?: number;
  scale?: number;
  seed?: number;
}

export function makeDirectionField(
  size: number,
  options: DirectionFieldOptions = {},
): TextureBuffer {
  const mode = options.mode ?? "linear";
  const baseAngle = options.angle ?? 0;
  const turbulence = options.turbulence ?? 0.35;
  const scale = options.scale ?? 4;
  const noise = makeNoise(options.seed ?? 0);
  const field = makeTexture(size, size, 2);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const centerX = u - 0.5;
      const centerY = v - 0.5;
      let angle = baseAngle;
      if (mode === "radial") angle += Math.atan2(centerY, centerX);
      if (mode === "swirl") angle += Math.atan2(centerY, centerX) + Math.hypot(centerX, centerY) * Math.PI * 2;
      angle += noise.noise2(u * scale, v * scale) * turbulence;
      const index = (y * size + x) * 2;
      field.data[index] = Math.cos(angle) * 0.5 + 0.5;
      field.data[index + 1] = Math.sin(angle) * 0.5 + 0.5;
    }
  }
  return field;
}

export function sampleDirection(field: TextureBuffer, x: number, y: number): [number, number] {
  if (field.channels !== 2) throw new Error("direction field must have two channels");
  return [sample(field, x, y, 0) * 2 - 1, sample(field, x, y, 1) * 2 - 1];
}

export interface ExtendedMaterialPhysical {
  ior: number;
  thickness: number;
  emissiveIntensity: number;
  alphaCutoff: number;
}

export interface ExtendedMaterial extends Material {
  opacity: TextureBuffer;
  transmission: TextureBuffer;
  anisotropy: TextureBuffer;
  anisotropyRotation: TextureBuffer;
  physical: ExtendedMaterialPhysical;
}

export interface ExtendedMaterialFields extends MaterialFields {
  opacity?: (u: number, v: number) => number;
  transmission?: (u: number, v: number) => number;
  anisotropy?: (u: number, v: number) => number;
  anisotropyRotation?: (u: number, v: number) => number;
  physical?: Partial<ExtendedMaterialPhysical>;
}

export function extendedMaterialFromFields(
  size: number,
  fields: ExtendedMaterialFields,
): ExtendedMaterial {
  const material = materialFromFields(size, fields);
  return {
    ...material,
    opacity: scalarMap(size, fields.opacity ?? (() => 1)),
    transmission: scalarMap(size, fields.transmission ?? (() => 0)),
    anisotropy: scalarMap(size, fields.anisotropy ?? (() => 0)),
    anisotropyRotation: scalarMap(size, fields.anisotropyRotation ?? (() => 0)),
    physical: {
      ior: fields.physical?.ior ?? 1.5,
      thickness: fields.physical?.thickness ?? 0,
      emissiveIntensity: fields.physical?.emissiveIntensity ?? 1,
      alphaCutoff: fields.physical?.alphaCutoff ?? 0,
    },
  };
}

export function assembleExtendedMaterial(
  base: Omit<Material, "normal"> & { normal?: TextureBuffer },
  extensions: Pick<ExtendedMaterial, "opacity" | "transmission" | "anisotropy" | "anisotropyRotation" | "physical">,
  normalStrength = 2,
): ExtendedMaterial {
  return {
    ...base,
    normal: base.normal ?? heightToNormal(base.height, normalStrength),
    ...extensions,
  };
}

export function validateExtendedMaterial(material: ExtendedMaterial): string[] {
  const problems = validateMaterial(material);
  const maps = [
    [material.opacity, "opacity"],
    [material.transmission, "transmission"],
    [material.anisotropy, "anisotropy"],
    [material.anisotropyRotation, "anisotropyRotation"],
  ] as const;
  for (const [map, name] of maps) {
    if (map.width !== material.height.width || map.height !== material.height.height || map.channels !== 1) {
      problems.push(`${name} shape mismatch`);
      continue;
    }
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const value of map.data) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    if (minimum < -1e-4 || maximum > 1 + 1e-4) problems.push(`${name} out of [0,1]`);
  }
  if (material.physical.ior < 1 || material.physical.ior > 2.5) problems.push("ior out of [1,2.5]");
  if (material.physical.thickness < 0) problems.push("thickness below 0");
  if (material.physical.emissiveIntensity < 0) problems.push("emissiveIntensity below 0");
  if (material.physical.alphaCutoff < 0 || material.physical.alphaCutoff > 1) problems.push("alphaCutoff out of [0,1]");
  return problems;
}

export function flatExtendedMaps(size: number): Pick<ExtendedMaterial, "opacity" | "transmission" | "anisotropy" | "anisotropyRotation"> {
  return {
    opacity: scalarMap(size, () => 1),
    transmission: scalarMap(size, () => 0),
    anisotropy: scalarMap(size, () => 0),
    anisotropyRotation: scalarMap(size, () => 0),
  };
}

export function colorTexture(size: number, color: [number, number, number]): TextureBuffer {
  return baseColorMap(size, () => color);
}
