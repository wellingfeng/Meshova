import { makeMesh, type Mesh } from "../geometry/mesh.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, sample, type TextureBuffer } from "./buffer.js";
import {
  bakeGeometryToTextures,
  type GeometryTextureBake,
} from "./geometry-bake.js";
import { heightToNormal, type Material } from "./pbr.js";
import {
  applyWeatherStack,
  type WeatherStackMasks,
  type WeatherStackOptions,
} from "./weather-stack.js";

export type FacadeSurfaceRole = "masonry" | "plaster" | "metal" | "glass" | "trim";
export type FacadeColor = readonly [number, number, number];

export interface FacadeMaterialLayer {
  readonly materialId: number;
  readonly role: FacadeSurfaceRole;
  readonly color: FacadeColor;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emission?: FacadeColor;
}

export interface FacadeMaterialPipelineOptions {
  readonly seed?: number;
  readonly wear?: number;
  readonly grime?: number;
  readonly rain?: number;
  readonly detailScale?: number;
  readonly brickColumns?: number;
  readonly brickRows?: number;
  readonly mortarWidth?: number;
  readonly normalStrength?: number;
  readonly weather?: WeatherStackOptions;
}

export interface FacadeMaterialMasks {
  readonly materialId: TextureBuffer;
  readonly masonry: TextureBuffer;
  readonly plaster: TextureBuffer;
  readonly metal: TextureBuffer;
  readonly glass: TextureBuffer;
  readonly trim: TextureBuffer;
  readonly mortar: TextureBuffer;
  readonly edgeWear: TextureBuffer;
  readonly cavityDirt: TextureBuffer;
  readonly rain: TextureBuffer;
}

export interface FacadeMaterialPipelineResult {
  readonly material: Material;
  readonly masks: FacadeMaterialMasks;
  readonly weatherMasks: WeatherStackMasks;
}

export interface FacadeDemoBakeOptions {
  readonly bays?: number;
  readonly floors?: number;
}

export function facadeMaterialPipeline(
  bake: GeometryTextureBake,
  layers: readonly FacadeMaterialLayer[],
  options: FacadeMaterialPipelineOptions = {},
): FacadeMaterialPipelineResult {
  assertBakeDimensions(bake);
  if (layers.length === 0) throw new Error("facade material pipeline requires at least one layer");
  const layerById = new Map<number, FacadeMaterialLayer>();
  for (const layer of layers) {
    if (!Number.isInteger(layer.materialId)) throw new Error("facade material layer id must be an integer");
    if (layerById.has(layer.materialId)) throw new Error(`duplicate facade material layer id: ${layer.materialId}`);
    layerById.set(layer.materialId, layer);
  }

  const { width, height } = bake.coverage;
  const baseColor = makeTexture(width, height, 3);
  const metallic = makeTexture(width, height, 1);
  const roughness = makeTexture(width, height, 1);
  const ao = makeTexture(width, height, 1);
  const resultHeight = makeTexture(width, height, 1);
  const emission = makeTexture(width, height, 3);
  const masks: FacadeMaterialMasks = {
    materialId: cloneTexture(bake.materialId),
    masonry: makeTexture(width, height, 1),
    plaster: makeTexture(width, height, 1),
    metal: makeTexture(width, height, 1),
    glass: makeTexture(width, height, 1),
    trim: makeTexture(width, height, 1),
    mortar: makeTexture(width, height, 1),
    edgeWear: makeTexture(width, height, 1),
    cavityDirt: makeTexture(width, height, 1),
    rain: makeTexture(width, height, 1),
  };
  const noise = makeNoise(options.seed ?? 0);
  const wearAmount = clamp(options.wear ?? 0.48, 0, 1);
  const grimeAmount = clamp(options.grime ?? 0.42, 0, 1);
  const rainAmount = clamp(options.rain ?? 0.34, 0, 1);
  const detailScale = Math.max(0.5, options.detailScale ?? 8);
  const brickColumns = Math.max(1, Math.floor(options.brickColumns ?? 9));
  const brickRows = Math.max(1, Math.floor(options.brickRows ?? 18));
  const mortarWidth = clamp(options.mortarWidth ?? 0.1, 0.01, 0.4);
  const [minimumId, maximumId] = bake.materialIdRange;

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const pixel = y * width + x;
      if (bake.coverage.data[pixel]! <= 0) {
        roughness.data[pixel] = 1;
        ao.data[pixel] = 1;
        continue;
      }
      const materialId = Math.round(mix(minimumId, maximumId, bake.materialId.data[pixel]!));
      const layer = layerById.get(materialId);
      if (!layer) throw new Error(`missing facade material layer id: ${materialId}`);
      masks[layer.role].data[pixel] = 1;

      const broadNoise = fbm2(noise, u * detailScale + 11, v * detailScale - 7, { octaves: 4 }) * 0.5 + 0.5;
      const fineNoise = fbm2(noise, u * detailScale * 4.1 - 19, v * detailScale * 4.1 + 23, { octaves: 3 }) * 0.5 + 0.5;
      const boundary = materialBoundary(bake.materialId, x, y);
      const localCavity = heightCavity(bake.height, x, y, Math.min(width, height));
      const bakedCavity = clamp((1 - bake.ao.data[pixel]!) * 2.4, 0, 1);
      const cavity = Math.max(localCavity, bakedCavity, boundary * 0.35);
      const edgeMask = clamp(
        (bake.curvature.data[pixel]! * 0.72 + boundary * 0.76)
          * (0.58 + broadNoise * 0.42)
          * wearAmount,
        0,
        1,
      );
      const dirtMask = clamp(
        (cavity * 0.72 + (1 - v) * 0.13 + broadNoise * 0.15) * grimeAmount,
        0,
        1,
      );
      const streakWave = Math.sin((u * detailScale * 1.7 + fineNoise * 0.28) * TAU) * 0.5 + 0.5;
      const rainMask = clamp(
        Math.pow(streakWave, 8) * (0.24 + (1 - v) * 0.76) * rainAmount,
        0,
        1,
      );
      const mortarMask = layer.role === "masonry"
        ? brickMortar(u, v, brickColumns, brickRows, mortarWidth)
        : 0;
      const roleDetail = surfaceDetail(layer.role, broadNoise, fineNoise, mortarMask);
      const baseRoughness = layer.roughness ?? defaultRoughness(layer.role);
      const baseMetallic = layer.metallic ?? (layer.role === "metal" ? 1 : 0);

      for (let channel = 0; channel < 3; channel++) {
        const base = layer.color[channel]! * roleDetail.colorScale;
        const mortarColor = layer.role === "masonry"
          ? mix(base, channel === 0 ? 0.15 : channel === 1 ? 0.135 : 0.115, mortarMask * 0.9)
          : base;
        const worn = mix(mortarColor, wearColor(layer.role, channel), edgeMask * wearResponse(layer.role));
        const dirty = mix(worn, channel === 0 ? 0.095 : channel === 1 ? 0.07 : 0.045, dirtMask * 0.72);
        baseColor.data[pixel * 3 + channel] = clamp(dirty * (1 - rainMask * 0.18), 0, 1);
        emission.data[pixel * 3 + channel] = layer.emission?.[channel] ?? 0;
      }
      metallic.data[pixel] = clamp(baseMetallic * (1 - dirtMask * 0.32), 0, 1);
      roughness.data[pixel] = clamp(
        baseRoughness + roleDetail.roughnessOffset + dirtMask * 0.2 - rainMask * 0.38 - edgeMask * 0.06,
        0.04,
        1,
      );
      ao.data[pixel] = clamp(bake.ao.data[pixel]! * (1 - mortarMask * 0.16 - dirtMask * 0.12), 0, 1);
      resultHeight.data[pixel] = clamp(
        bake.height.data[pixel]! * 0.82 + roleDetail.heightOffset - mortarMask * 0.018 + dirtMask * 0.008,
        0,
        1,
      );
      masks.mortar.data[pixel] = mortarMask;
      masks.edgeWear.data[pixel] = edgeMask;
      masks.cavityDirt.data[pixel] = dirtMask;
      masks.rain.data[pixel] = rainMask;
    }
  }

  const baseMaterial: Material = {
    baseColor,
    metallic,
    roughness,
    normal: heightToNormal(resultHeight, options.normalStrength ?? 6),
    ao,
    height: resultHeight,
    emission,
  };
  const weathered = applyWeatherStack(baseMaterial, {
    ...options.weather,
    seed: options.weather?.seed ?? (options.seed ?? 0) + 101,
    normalStrength: options.weather?.normalStrength ?? options.normalStrength ?? 6,
  });
  restoreUncoveredPixels(baseMaterial, weathered.material, weathered.masks, bake.coverage);
  return { material: weathered.material, masks, weatherMasks: weathered.masks };
}

export function createFacadeDemoBake(
  size: number,
  options: FacadeDemoBakeOptions = {},
): GeometryTextureBake {
  const resolution = Math.max(16, Math.floor(size));
  const bays = Math.max(2, Math.floor(options.bays ?? 4));
  const floors = Math.max(1, Math.floor(options.floors ?? 3));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const materialIds: number[] = [];
  const primitiveIds: number[] = [];
  let primitiveId = 0;

  const addRect = (u0: number, v0: number, u1: number, v1: number, depth: number, materialId: number): void => {
    const base = positions.length;
    positions.push(
      vec3(u0 * 2 - 1, v0 * 2 - 1, depth),
      vec3(u1 * 2 - 1, v0 * 2 - 1, depth),
      vec3(u1 * 2 - 1, v1 * 2 - 1, depth),
      vec3(u0 * 2 - 1, v1 * 2 - 1, depth),
    );
    normals.push(vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1));
    uvs.push(vec2(u0, v0), vec2(u1, v0), vec2(u1, v1), vec2(u0, v1));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    materialIds.push(materialId, materialId);
    primitiveIds.push(primitiveId++, primitiveId++);
  };

  addRect(0, 0, 1, 1, 0, 0);
  addRect(0, 0, 1, 0.22, 0.035, 1);
  const facadeTop = 0.93;
  const floorBottom = 0.25;
  const floorSpan = (facadeTop - floorBottom) / floors;
  const baySpan = 1 / bays;
  for (let floor = 0; floor < floors; floor++) {
    const centerV = floorBottom + floorSpan * (floor + 0.5);
    const halfHeight = floorSpan * 0.3;
    for (let bay = 0; bay < bays; bay++) {
      const centerU = baySpan * (bay + 0.5);
      const halfWidth = baySpan * 0.29;
      const u0 = centerU - halfWidth;
      const u1 = centerU + halfWidth;
      const v0 = centerV - halfHeight;
      const v1 = centerV + halfHeight;
      const frame = Math.min(0.014, halfWidth * 0.22, halfHeight * 0.22);
      addRect(u0, v0, u1, v1, 0.07, 3);
      addRect(u0 - frame, v0 - frame, u1 + frame, v0 + frame, 0.105, 2);
      addRect(u0 - frame, v1 - frame, u1 + frame, v1 + frame, 0.105, 2);
      addRect(u0 - frame, v0, u0 + frame, v1, 0.105, 2);
      addRect(u1 - frame, v0, u1 + frame, v1, 0.105, 2);
      addRect(centerU - frame * 0.55, v0, centerU + frame * 0.55, v1, 0.11, 2);
    }
  }
  addRect(0, 0.205, 1, 0.225, 0.125, 4);
  for (let floor = 1; floor <= floors; floor++) {
    const v = floorBottom + floorSpan * floor;
    addRect(0, v - 0.009, 1, v + 0.009, 0.125, 4);
  }
  for (let bay = 1; bay < bays; bay++) {
    const u = bay / bays;
    addRect(u - 0.008, 0.22, u + 0.008, facadeTop, 0.12, 4);
  }

  const mesh: Mesh = makeMesh({ positions, normals, uvs, indices });
  return bakeGeometryToTextures(mesh, {
    width: resolution,
    height: resolution,
    heightAxis: vec3(0, 0, 1),
    primitiveIds,
    materialIds,
    curvatureAoStrength: 0.8,
  });
}

function surfaceDetail(
  role: FacadeSurfaceRole,
  broadNoise: number,
  fineNoise: number,
  mortar: number,
): { colorScale: number; roughnessOffset: number; heightOffset: number } {
  switch (role) {
    case "masonry": return {
      colorScale: 0.82 + broadNoise * 0.3,
      roughnessOffset: fineNoise * 0.08 + mortar * 0.06,
      heightOffset: (1 - mortar) * 0.02 + fineNoise * 0.006,
    };
    case "plaster": return {
      colorScale: 0.9 + broadNoise * 0.16,
      roughnessOffset: fineNoise * 0.07,
      heightOffset: fineNoise * 0.009,
    };
    case "metal": return {
      colorScale: 0.9 + fineNoise * 0.14,
      roughnessOffset: (fineNoise - 0.5) * 0.09,
      heightOffset: fineNoise * 0.004,
    };
    case "glass": return {
      colorScale: 0.8 + broadNoise * 0.12,
      roughnessOffset: fineNoise * 0.035,
      heightOffset: 0,
    };
    case "trim": return {
      colorScale: 0.88 + broadNoise * 0.2,
      roughnessOffset: fineNoise * 0.06,
      heightOffset: fineNoise * 0.007,
    };
  }
}

function brickMortar(
  u: number,
  v: number,
  columns: number,
  rows: number,
  width: number,
): number {
  const row = Math.floor(v * rows);
  const localU = fractional(u * columns + (row % 2) * 0.5);
  const localV = fractional(v * rows);
  const edgeDistance = Math.min(localU, 1 - localU, localV, 1 - localV);
  return 1 - smoothstep(width * 0.5, width, edgeDistance);
}

function heightCavity(texture: TextureBuffer, x: number, y: number, pixelScale: number): number {
  const center = sample(texture, x, y);
  const neighbors = (
    sample(texture, x - 1, y)
    + sample(texture, x + 1, y)
    + sample(texture, x, y - 1)
    + sample(texture, x, y + 1)
  ) * 0.25;
  return clamp((neighbors - center) * pixelScale * 0.3, 0, 1);
}

function materialBoundary(texture: TextureBuffer, x: number, y: number): number {
  const center = sample(texture, x, y);
  const difference = Math.max(
    Math.abs(sample(texture, x - 1, y) - center),
    Math.abs(sample(texture, x + 1, y) - center),
    Math.abs(sample(texture, x, y - 1) - center),
    Math.abs(sample(texture, x, y + 1) - center),
  );
  return smoothstep(1e-5, 0.08, difference);
}

function defaultRoughness(role: FacadeSurfaceRole): number {
  switch (role) {
    case "masonry": return 0.82;
    case "plaster": return 0.76;
    case "metal": return 0.3;
    case "glass": return 0.12;
    case "trim": return 0.68;
  }
}

function wearResponse(role: FacadeSurfaceRole): number {
  if (role === "glass") return 0.08;
  if (role === "metal") return 0.9;
  return 0.42;
}

function wearColor(role: FacadeSurfaceRole, channel: number): number {
  if (role === "metal") return channel === 2 ? 0.52 : 0.48;
  if (role === "glass") return channel === 2 ? 0.24 : channel === 1 ? 0.17 : 0.1;
  return channel === 0 ? 0.68 : channel === 1 ? 0.64 : 0.57;
}

function restoreUncoveredPixels(
  base: Material,
  weathered: Material,
  masks: WeatherStackMasks,
  coverage: TextureBuffer,
): void {
  for (let pixel = 0; pixel < coverage.width * coverage.height; pixel++) {
    if (coverage.data[pixel]! > 0) continue;
    weathered.metallic.data[pixel] = base.metallic.data[pixel]!;
    weathered.roughness.data[pixel] = base.roughness.data[pixel]!;
    weathered.ao.data[pixel] = base.ao.data[pixel]!;
    weathered.height.data[pixel] = base.height.data[pixel]!;
    for (let channel = 0; channel < 3; channel++) {
      weathered.baseColor.data[pixel * 3 + channel] = base.baseColor.data[pixel * 3 + channel]!;
      weathered.normal.data[pixel * 3 + channel] = base.normal.data[pixel * 3 + channel]!;
    }
    masks.wetness.data[pixel] = 0;
    masks.dirt.data[pixel] = 0;
    masks.rust.data[pixel] = 0;
    masks.moss.data[pixel] = 0;
    masks.snow.data[pixel] = 0;
  }
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
      throw new Error(`facade material pipeline ${name} dimensions mismatch`);
    }
  }
}

function cloneTexture(texture: TextureBuffer): TextureBuffer {
  const clone = makeTexture(texture.width, texture.height, texture.channels);
  clone.data.set(texture.data);
  return clone;
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
