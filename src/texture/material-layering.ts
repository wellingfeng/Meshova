import { clamp, smoothstep } from "../math/scalar.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import { aoFromHeight, curvature } from "./filters.js";
import { deriveHeightFeatures } from "./material-mechanics.js";
import { mixMaterials, type MaterialMask } from "./mix-material.js";
import type { Material } from "./pbr.js";

export interface SemanticLayerMaskOptions {
  heightRange?: [number, number];
  slopeRange?: [number, number];
  curvatureRange?: [number, number];
  aoRange?: [number, number];
  wetness?: number | TextureBuffer;
  wetnessRange?: [number, number];
  softness?: number;
  invert?: boolean;
}

function rangeWeight(value: number, range: [number, number], softness: number): number {
  const low = Math.min(range[0], range[1]);
  const high = Math.max(range[0], range[1]);
  const rise = smoothstep(low - softness, low + softness, value);
  const fall = 1 - smoothstep(high - softness, high + softness, value);
  return rise * fall;
}

/** Build one coherent layer mask from height, slope, curvature, AO and wetness. */
export function semanticLayerMask(
  height: TextureBuffer,
  options: SemanticLayerMaskOptions = {},
): TextureBuffer {
  const softness = Math.max(1e-4, options.softness ?? 0.08);
  const needsSlope = options.slopeRange !== undefined;
  const slope = needsSlope ? deriveHeightFeatures(height).slope : null;
  const curve = options.curvatureRange ? curvature(height, { intensity: 6 }) : null;
  const ao = options.aoRange ? aoFromHeight(height, { radius: 4, intensity: 2 }) : null;
  const out = makeTexture(height.width, height.height, 1);
  for (let y = 0; y < height.height; y++) {
    for (let x = 0; x < height.width; x++) {
      let weight = 1;
      if (options.heightRange) weight *= rangeWeight(sample(height, x, y), options.heightRange, softness);
      if (options.slopeRange) weight *= rangeWeight(sample(slope!, x, y), options.slopeRange, softness);
      if (options.curvatureRange) weight *= rangeWeight(sample(curve!, x, y), options.curvatureRange, softness);
      if (options.aoRange) weight *= rangeWeight(sample(ao!, x, y), options.aoRange, softness);
      if (options.wetness !== undefined) {
        const wetness = typeof options.wetness === "number"
          ? options.wetness
          : sample(options.wetness, x, y);
        weight *= rangeWeight(wetness, options.wetnessRange ?? [0.5, 1], softness);
      }
      out.data[y * height.width + x] = options.invert ? 1 - clamp(weight, 0, 1) : clamp(weight, 0, 1);
    }
  }
  return out;
}

export interface PbrMaterialLayer {
  material: Material;
  mask: MaterialMask;
  opacity?: number;
  /** Height blend lets raised layer pixels claim the surface before low pixels. */
  blend?: "linear" | "height";
  heightBias?: number;
  heightContrast?: number;
}

function resolveLayerMask(base: Material, layer: PbrMaterialLayer): TextureBuffer {
  const out = makeTexture(base.height.width, base.height.height, 1);
  const opacity = clamp(layer.opacity ?? 1, 0, 1);
  const maskBuffer = typeof layer.mask === "function" ? null : layer.mask;
  const maskFunction = typeof layer.mask === "function" ? layer.mask : null;
  const contrast = Math.max(1e-4, layer.heightContrast ?? 0.15);
  const bias = layer.heightBias ?? 0;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const u = (x + 0.5) / out.width;
      const v = (y + 0.5) / out.height;
      let weight = maskFunction ? maskFunction(u, v) : sample(maskBuffer!, x, y);
      if (layer.blend === "height") {
        const delta = sample(layer.material.height, x, y) - sample(base.height, x, y) + bias;
        weight *= smoothstep(-contrast, contrast, delta);
      }
      out.data[y * out.width + x] = clamp(weight * opacity, 0, 1);
    }
  }
  return out;
}

function normalizeMaterialNormals(material: Material): Material {
  const normal = makeTexture(material.normal.width, material.normal.height, 3);
  for (let index = 0; index < normal.width * normal.height; index++) {
    let x = material.normal.data[index * 3]! * 2 - 1;
    let y = material.normal.data[index * 3 + 1]! * 2 - 1;
    let z = material.normal.data[index * 3 + 2]! * 2 - 1;
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    normal.data[index * 3] = x * 0.5 + 0.5;
    normal.data[index * 3 + 1] = y * 0.5 + 0.5;
    normal.data[index * 3 + 2] = z * 0.5 + 0.5;
  }
  return { ...material, normal };
}

/** Compose any number of coherent PBR layers in order. */
export function layerMaterials(base: Material, layers: readonly PbrMaterialLayer[]): Material {
  let result = base;
  for (const layer of layers) {
    result = mixMaterials(result, layer.material, resolveLayerMask(result, layer));
    result = normalizeMaterialNormals(result);
  }
  return result;
}
