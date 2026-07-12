import type { Material } from "./pbr.js";
import type { TextureBuffer } from "./buffer.js";

export interface TextureDifference {
  readonly maximum: number;
  readonly mean: number;
  readonly rmse: number;
  readonly failingValues: number;
  readonly values: number;
  readonly withinTolerance: boolean;
}

export function compareTextureResults(
  expected: TextureBuffer,
  actual: TextureBuffer,
  tolerance = 1e-5,
): TextureDifference {
  if (
    expected.width !== actual.width
    || expected.height !== actual.height
    || expected.channels !== actual.channels
  ) throw new Error("texture comparison requires matching shapes");
  const limit = Math.max(0, tolerance);
  let maximum = 0;
  let total = 0;
  let squared = 0;
  let failingValues = 0;
  for (let index = 0; index < expected.data.length; index++) {
    const error = Math.abs(expected.data[index]! - actual.data[index]!);
    maximum = Math.max(maximum, error);
    total += error;
    squared += error * error;
    if (error > limit) failingValues++;
  }
  const values = expected.data.length;
  return {
    maximum,
    mean: values === 0 ? 0 : total / values,
    rmse: values === 0 ? 0 : Math.sqrt(squared / values),
    failingValues,
    values,
    withinTolerance: failingValues === 0,
  };
}

export interface MaterialQualityBaseline {
  readonly channels: Readonly<Record<keyof Material, TextureStatistics>>;
}

export interface TextureStatistics {
  readonly minimum: number;
  readonly maximum: number;
  readonly mean: number;
  readonly variance: number;
  readonly fingerprint: string;
}

export function createMaterialQualityBaseline(material: Material): MaterialQualityBaseline {
  return {
    channels: {
      baseColor: textureStatistics(material.baseColor),
      metallic: textureStatistics(material.metallic),
      roughness: textureStatistics(material.roughness),
      normal: textureStatistics(material.normal),
      ao: textureStatistics(material.ao),
      height: textureStatistics(material.height),
      emission: textureStatistics(material.emission),
    },
  };
}

export interface MaterialConformanceReport {
  readonly problems: readonly string[];
  readonly normalMeanLength: number;
  readonly normalMaximumError: number;
  readonly dielectricBaseColorMaximum: number;
  readonly metallicTransitionPixels: number;
}

/** Game-asset checks beyond scalar channel ranges. */
export function analyzeMaterialConformance(material: Material): MaterialConformanceReport {
  const problems: string[] = [];
  const pixels = material.height.width * material.height.height;
  assertMaterialShape(material, problems);
  let normalLengthTotal = 0;
  let normalMaximumError = 0;
  let dielectricBaseColorMaximum = 0;
  let metallicTransitionPixels = 0;
  for (let pixel = 0; pixel < pixels; pixel++) {
    const nx = material.normal.data[pixel * 3]! * 2 - 1;
    const ny = material.normal.data[pixel * 3 + 1]! * 2 - 1;
    const nz = material.normal.data[pixel * 3 + 2]! * 2 - 1;
    const normalLength = Math.hypot(nx, ny, nz);
    normalLengthTotal += normalLength;
    normalMaximumError = Math.max(normalMaximumError, Math.abs(normalLength - 1));
    const metallic = material.metallic.data[pixel]!;
    if (metallic > 0.05 && metallic < 0.95) metallicTransitionPixels++;
    if (metallic < 0.05) {
      dielectricBaseColorMaximum = Math.max(
        dielectricBaseColorMaximum,
        material.baseColor.data[pixel * 3]!,
        material.baseColor.data[pixel * 3 + 1]!,
        material.baseColor.data[pixel * 3 + 2]!,
      );
    }
  }
  const normalMeanLength = pixels === 0 ? 0 : normalLengthTotal / pixels;
  if (normalMaximumError > 0.05) problems.push(`normal length error ${normalMaximumError.toFixed(4)} exceeds 0.05`);
  if (dielectricBaseColorMaximum > 0.9) problems.push(`dielectric base color ${dielectricBaseColorMaximum.toFixed(4)} exceeds 0.9 energy guideline`);
  return { problems, normalMeanLength, normalMaximumError, dielectricBaseColorMaximum, metallicTransitionPixels };
}

export function textureStatistics(texture: TextureBuffer): TextureStatistics {
  let minimum = Infinity;
  let maximum = -Infinity;
  let mean = 0;
  let hash = 2166136261;
  for (const value of texture.data) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    mean += value;
    hash ^= Math.round(value * 1e6);
    hash = Math.imul(hash, 16777619);
  }
  if (texture.data.length === 0) return { minimum: 0, maximum: 0, mean: 0, variance: 0, fingerprint: "0" };
  mean /= texture.data.length;
  let variance = 0;
  for (const value of texture.data) variance += (value - mean) ** 2;
  variance /= texture.data.length;
  return { minimum, maximum, mean, variance, fingerprint: (hash >>> 0).toString(16).padStart(8, "0") };
}

function assertMaterialShape(material: Material, problems: string[]): void {
  const width = material.height.width;
  const height = material.height.height;
  const expected: Readonly<Record<keyof Material, number>> = {
    baseColor: 3,
    metallic: 1,
    roughness: 1,
    normal: 3,
    ao: 1,
    height: 1,
    emission: 3,
  };
  for (const channel of Object.keys(expected) as Array<keyof Material>) {
    const texture = material[channel];
    if (texture.width !== width || texture.height !== height || texture.channels !== expected[channel]) {
      problems.push(`${channel} shape mismatch`);
    }
  }
}
