import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { dot, normalize, vec3, type Vec3 } from "../math/vec3.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import type { GeometryTextureBake } from "./geometry-bake.js";
import { heightToNormal, type Material } from "./pbr.js";

export type SmartMaterialColor = readonly [number, number, number];

export interface BakedSmartMaterialSurface {
  readonly color: SmartMaterialColor;
  readonly metallic: number;
  readonly roughness: number;
}

export interface BakedSmartMaterialLayer extends BakedSmartMaterialSurface {
  readonly materialId: number;
  readonly underlayer?: BakedSmartMaterialSurface;
}

export interface BakedSmartMaterialOptions {
  readonly seed?: number;
  readonly wear?: number;
  readonly dirt?: number;
  readonly rain?: number;
  readonly scratches?: number;
  readonly scale?: number;
  readonly normalStrength?: number;
  readonly rainDirection?: Vec3;
  readonly dirtColor?: SmartMaterialColor;
}

export interface BakedSmartMaterialMasks {
  readonly materialId: TextureBuffer;
  readonly edgeWear: TextureBuffer;
  readonly scratches: TextureBuffer;
  readonly exposedUnderlayer: TextureBuffer;
  readonly cavityDirt: TextureBuffer;
  readonly rain: TextureBuffer;
}

export interface BakedSmartMaterialResult {
  readonly material: Material;
  readonly masks: BakedSmartMaterialMasks;
}

export function bakedSmartMaterial(
  bake: GeometryTextureBake,
  layers: readonly BakedSmartMaterialLayer[],
  options: BakedSmartMaterialOptions = {},
): BakedSmartMaterialResult {
  assertBakeDimensions(bake);
  if (layers.length === 0) throw new Error("baked smart material requires at least one layer");
  const layerById = new Map<number, BakedSmartMaterialLayer>();
  for (const layer of layers) {
    if (!Number.isInteger(layer.materialId)) throw new Error("baked smart material layer id must be an integer");
    if (layerById.has(layer.materialId)) throw new Error(`duplicate baked smart material layer id: ${layer.materialId}`);
    layerById.set(layer.materialId, layer);
  }

  const { width, height } = bake.coverage;
  const edgeWear = makeTexture(width, height, 1);
  const scratches = makeTexture(width, height, 1);
  const exposedUnderlayer = makeTexture(width, height, 1);
  const cavityDirt = makeTexture(width, height, 1);
  const rain = makeTexture(width, height, 1);
  const baseColor = makeTexture(width, height, 3);
  const metallic = makeTexture(width, height, 1);
  const roughness = makeTexture(width, height, 1);
  const ao = makeTexture(width, height, 1);
  const resultHeight = makeTexture(width, height, 1);
  const emission = makeTexture(width, height, 3);
  const materialId = cloneTexture(bake.materialId);
  const noise = makeNoise(options.seed ?? 0);
  const wearAmount = clamp(options.wear ?? 0.55, 0, 1);
  const dirtAmount = clamp(options.dirt ?? 0.45, 0, 1);
  const rainAmount = clamp(options.rain ?? 0.35, 0, 1);
  const scratchAmount = clamp(options.scratches ?? 0.4, 0, 1);
  const scale = Math.max(1, options.scale ?? 8);
  const rainDirection = normalize(options.rainDirection ?? vec3(0.12, -0.82, -0.56));
  const dirtColor = options.dirtColor ?? [0.055, 0.038, 0.022];
  const [minimumId, maximumId] = bake.materialIdRange;

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (bake.coverage.data[pixel]! <= 0) {
        roughness.data[pixel] = 1;
        ao.data[pixel] = 1;
        resultHeight.data[pixel] = bake.height.data[pixel]!;
        continue;
      }
      const u = (x + 0.5) / width;
      const decodedId = Math.round(mix(minimumId, maximumId, bake.materialId.data[pixel]!));
      const layer = layerById.get(decodedId);
      if (!layer) throw new Error(`missing baked smart material layer id: ${decodedId}`);
      const curvature = clamp(bake.curvature.data[pixel]!, 0, 1);
      const cavity = clamp(1 - bake.ao.data[pixel]!, 0, 1);
      const boundary = materialBoundary(bake.materialId, x, y);
      const broadNoise = fbm2(noise, u * scale + 19, v * scale - 7, { octaves: 4 }) * 0.5 + 0.5;
      const fineNoise = fbm2(noise, u * scale * 4.3 - 13, v * scale * 4.3 + 23, { octaves: 3 }) * 0.5 + 0.5;
      const edgeMask = clamp(
        (curvature * 0.76 + boundary * 0.62) * (0.62 + broadNoise * 0.38) * wearAmount,
        0,
        1,
      );
      const scratchLine = 1 - smoothstep(
        0.025,
        0.085,
        Math.abs(Math.sin((u * 0.17 + v + fineNoise * 0.025) * scale * 17 * TAU)),
      );
      const scratchGate = smoothstep(0.58, 0.86, broadNoise);
      const scratchMask = clamp(scratchLine * scratchGate * scratchAmount, 0, 1);
      const exposed = layer.underlayer
        ? clamp(Math.max(edgeMask, scratchMask * 0.72), 0, 1)
        : 0;
      const normal = vec3(
        bake.worldNormal.data[pixel * 3]! * 2 - 1,
        bake.worldNormal.data[pixel * 3 + 1]! * 2 - 1,
        bake.worldNormal.data[pixel * 3 + 2]! * 2 - 1,
      );
      const positionX = bake.position.data[pixel * 3]!;
      const positionY = bake.position.data[pixel * 3 + 1]!;
      const positionZ = bake.position.data[pixel * 3 + 2]!;
      const exposure = clamp(-dot(normalize(normal), rainDirection), 0, 1);
      const streakWave = Math.sin(
        (positionX * 0.82 + positionZ * 0.18) * scale * 2.8 * TAU + fineNoise * 1.6,
      ) * 0.5 + 0.5;
      const streak = Math.pow(streakWave, 7) * (0.28 + smoothstep(0.22, 0.82, broadNoise) * 0.72);
      const rainMask = clamp(exposure * (0.3 + (1 - positionY) * 0.7) * streak * rainAmount, 0, 1);
      const dirtMask = clamp(
        (cavity * 0.78 + (1 - positionY) * 0.12 + broadNoise * 0.1)
          * (1 - rainMask * 0.62)
          * dirtAmount,
        0,
        1,
      );
      const source = layer.underlayer ?? layer;
      for (let channel = 0; channel < 3; channel++) {
        const worn = mix(layer.color[channel]!, source.color[channel]!, exposed);
        const dirty = mix(worn, dirtColor[channel]!, dirtMask * 0.72);
        baseColor.data[pixel * 3 + channel] = clamp(dirty * (1 - rainMask * 0.2), 0, 1);
      }
      metallic.data[pixel] = clamp(
        mix(layer.metallic, source.metallic, exposed) * (1 - dirtMask * 0.18),
        0,
        1,
      );
      roughness.data[pixel] = clamp(
        mix(layer.roughness, source.roughness, exposed) + dirtMask * 0.24 - rainMask * 0.42,
        0.04,
        1,
      );
      ao.data[pixel] = clamp(bake.ao.data[pixel]! * (1 - dirtMask * 0.2), 0, 1);
      resultHeight.data[pixel] = clamp(
        bake.height.data[pixel]! + dirtMask * 0.012 - exposed * 0.008 - scratchMask * 0.004,
        0,
        1,
      );
      edgeWear.data[pixel] = edgeMask;
      scratches.data[pixel] = scratchMask;
      exposedUnderlayer.data[pixel] = exposed;
      cavityDirt.data[pixel] = dirtMask;
      rain.data[pixel] = rainMask;
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(resultHeight, options.normalStrength ?? 5),
      ao,
      height: resultHeight,
      emission,
    },
    masks: { materialId, edgeWear, scratches, exposedUnderlayer, cavityDirt, rain },
  };
}

function materialBoundary(materialId: TextureBuffer, x: number, y: number): number {
  const center = sample(materialId, x, y);
  const difference = Math.max(
    Math.abs(sample(materialId, x - 1, y) - center),
    Math.abs(sample(materialId, x + 1, y) - center),
    Math.abs(sample(materialId, x, y - 1) - center),
    Math.abs(sample(materialId, x, y + 1) - center),
  );
  return smoothstep(1e-5, 0.1, difference);
}

function assertBakeDimensions(bake: GeometryTextureBake): void {
  const { width, height } = bake.coverage;
  const textures: Array<readonly [TextureBuffer, number, string]> = [
    [bake.height, 1, "height"],
    [bake.id, 1, "id"],
    [bake.materialId, 1, "materialId"],
    [bake.position, 3, "position"],
    [bake.normal, 3, "normal"],
    [bake.worldNormal, 3, "worldNormal"],
    [bake.thickness, 1, "thickness"],
    [bake.ao, 1, "ao"],
    [bake.curvature, 1, "curvature"],
    [bake.coverage, 1, "coverage"],
  ];
  for (const [texture, channels, name] of textures) {
    if (texture.width !== width || texture.height !== height || texture.channels !== channels) {
      throw new Error(`baked smart material ${name} dimensions mismatch`);
    }
  }
}

function cloneTexture(texture: TextureBuffer): TextureBuffer {
  const clone = makeTexture(texture.width, texture.height, texture.channels);
  clone.data.set(texture.data);
  return clone;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
