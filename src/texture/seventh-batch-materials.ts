import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import {
  deriveSemanticSurfaceFields,
  simulateAssetLifecycle,
  type AssetLifecycleMaps,
  type AssetLifecycleOptions,
  type SemanticSurfaceFields,
  type SemanticSurfaceOptions,
} from "./asset-material-mechanics.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial } from "./material-mechanics.js";
import { blendColor } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import {
  assembleLayeredMaterial,
  type LayeredMaterial,
  type LayeredMaterialPhysical,
} from "./shading-mechanics.js";

type RGB = [number, number, number];

type SeventhBatchMaterialKind =
  | "handledBrass"
  | "paintedTool"
  | "cookware"
  | "shipHull"
  | "rebarConcrete"
  | "woodStairs"
  | "leatherSeat"
  | "ceramicBasin"
  | "copperRoof"
  | "safetyFloor";

export interface SeventhBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  time?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface SeventhBatchMaterialParamSpec {
  key: keyof SeventhBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface SeventhBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: SeventhBatchMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  time: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  normalStrength: number;
  lifecycle: AssetLifecycleOptions;
  physical: LayeredMaterialPhysical;
}

interface PreparedAssetMaps {
  semantic: SemanticSurfaceFields;
  lifecycle: AssetLifecycleMaps;
}

interface MaterialSample {
  baseColor: RGB;
  height: number;
  metallic: number;
  roughness: number;
  ao: number;
  emission: RGB;
  opacity: number;
  transmission: number;
  anisotropy: number;
  anisotropyRotation: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenColor: RGB;
  thickness: number;
  subsurface: number;
  iridescence: number;
  iridescenceThickness: number;
}

const clamp01 = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);

function mixColor(left: RGB, right: RGB, amount: number): RGB {
  return blendColor(left, right, clamp01(amount));
}

function shade(color: RGB, amount: number): RGB {
  return color.map((channel) => clamp01(channel * amount)) as RGB;
}

function writeColor(texture: TextureBuffer, pixel: number, color: RGB): void {
  texture.data[pixel * 3] = clamp01(color[0]);
  texture.data[pixel * 3 + 1] = clamp01(color[1]);
  texture.data[pixel * 3 + 2] = clamp01(color[2]);
}

function semanticOptions(kind: SeventhBatchMaterialKind, seed: number, scale: number): SemanticSurfaceOptions {
  const common = { seed, scale, edgeFrequency: 4 };
  switch (kind) {
    case "handledBrass":
      return { ...common, contactSources: [{ center: [0.5, 0.5], radius: [0.3, 0.46], shape: "ring" }], loadSources: [{ center: [0.5, 0.5], radius: [0.22, 0.42] }] };
    case "paintedTool":
      return { ...common, contactSources: [{ center: [0.5, 0.24], radius: [0.36, 0.18], shape: "stripe" }], loadSources: [{ center: [0.5, 0.72], radius: [0.44, 0.12], shape: "stripe" }] };
    case "cookware":
      return { ...common, heatSources: [{ center: [0.5, 0.5], radius: [0.42, 0.42], shape: "ring" }], contactSources: [{ center: [0.5, 0.5], radius: [0.2, 0.2] }] };
    case "shipHull":
      return { ...common, waterline: 0.48, rainDirection: [0.08, -1], loadSources: [{ center: [0.5, 0.48], radius: [0.7, 0.08], shape: "stripe" }] };
    case "rebarConcrete":
      return { ...common, rainDirection: [0.12, -1], loadSources: [{ center: [0.52, 0.52], radius: [0.14, 0.62], shape: "stripe", rotation: 0.62 }] };
    case "woodStairs":
      return { ...common, contactSources: [{ center: [0.33, 0.5], radius: [0.16, 0.55], shape: "stripe" }, { center: [0.68, 0.5], radius: [0.16, 0.55], shape: "stripe" }], loadSources: [{ center: [0.5, 0.5], radius: [0.46, 0.7] }] };
    case "leatherSeat":
      return { ...common, contactSources: [{ center: [0.5, 0.48], radius: [0.36, 0.42] }], loadSources: [{ center: [0.5, 0.58], radius: [0.28, 0.3] }] };
    case "ceramicBasin":
      return { ...common, waterline: 0.42, rainDirection: [0, -1], contactSources: [{ center: [0.5, 0.55], radius: [0.28, 0.3], shape: "ring" }] };
    case "copperRoof":
      return { ...common, rainDirection: [0.26, -1], waterline: 0.18, edgeFrequency: 6 };
    case "safetyFloor":
      return { ...common, contactSources: [{ center: [0.35, 0.5], radius: [0.18, 0.8], shape: "stripe" }, { center: [0.66, 0.5], radius: [0.18, 0.8], shape: "stripe" }], loadSources: [{ center: [0.5, 0.5], radius: [0.52, 0.8] }] };
  }
}

function prepareMaps(
  definition: SeventhBatchMaterialDefinition,
  size: number,
  seed: number,
  scale: number,
  time: number,
): PreparedAssetMaps {
  const semantic = deriveSemanticSurfaceFields(size, semanticOptions(definition.kind, seed, scale));
  const lifecycle = simulateAssetLifecycle(semantic, {
    ...definition.lifecycle,
    time,
  });
  return { semantic, lifecycle };
}

function defaultSample(color: RGB, roughness: number): MaterialSample {
  return {
    baseColor: color,
    height: 0.5,
    metallic: 0,
    roughness,
    ao: 1,
    emission: [0, 0, 0],
    opacity: 1,
    transmission: 0,
    anisotropy: 0,
    anisotropyRotation: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    sheen: 0,
    sheenColor: [1, 1, 1],
    thickness: 0,
    subsurface: 0,
    iridescence: 0,
    iridescenceThickness: 0.5,
  };
}

function sampleMaterial(
  definition: SeventhBatchMaterialDefinition,
  maps: PreparedAssetMaps,
  noise: Noise,
  detailNoise: Noise,
  u: number,
  v: number,
  pixel: number,
  scale: number,
  detail: number,
  amount: number,
  color: RGB,
  accentColor: RGB,
  roughness: number,
): MaterialSample {
  const sample = defaultSample(color, roughness);
  const macro = fbm2(noise, u * scale, v * scale, { octaves: 5 }) * 0.5 + 0.5;
  const micro = fbm2(detailNoise, u * scale * detail, v * scale * detail, { octaves: 3 }) * 0.5 + 0.5;
  const edge = maps.semantic.edge.data[pixel]!;
  const cavity = maps.semantic.cavity.data[pixel]!;
  const runoff = maps.semantic.runoff.data[pixel]!;
  const waterline = maps.semantic.waterline.data[pixel]!;
  const heat = maps.semantic.heat.data[pixel]!;
  const wear = maps.lifecycle.wear.data[pixel]!;
  const polish = maps.lifecycle.polish.data[pixel]!;
  const loss = maps.lifecycle.coatingLoss.data[pixel]!;
  const grime = maps.lifecycle.grime.data[pixel]!;
  const oxidation = maps.lifecycle.oxidation.data[pixel]!;
  const carbon = maps.lifecycle.carbon.data[pixel]!;
  const mineral = maps.lifecycle.mineral.data[pixel]!;

  switch (definition.kind) {
    case "handledBrass": {
      const patina = clamp01(oxidation * 0.82 + grime * 0.42 + smoothstep(0.66, 0.9, 1 - macro) * cavity * 0.32) * amount;
      sample.baseColor = mixColor(shade(color, 0.82 + macro * 0.3), accentColor, patina);
      sample.height = 0.48 + micro * 0.035 - polish * 0.025 + grime * 0.05;
      sample.metallic = 1 - patina * 0.32;
      sample.roughness = clamp(roughness + patina * 0.3 - polish * 0.42, 0.04, 1);
      sample.ao = 1 - grime * 0.28;
      sample.clearcoat = polish * 0.32;
      sample.clearcoatRoughness = 0.06 + patina * 0.2;
      break;
    }
    case "paintedTool": {
      const exposed = clamp01(loss * 0.82 + edge * amount * 0.36);
      const grease = grime * (0.45 + wear * 0.55);
      sample.baseColor = mixColor(mixColor(color, accentColor, exposed), [0.045, 0.05, 0.052], grease * 0.72);
      sample.height = 0.54 + micro * 0.025 - exposed * 0.09 + edge * 0.035;
      sample.metallic = exposed * 0.96;
      sample.roughness = clamp(roughness + exposed * 0.22 - grease * 0.34, 0.04, 1);
      sample.ao = 1 - grime * 0.24;
      sample.clearcoat = (1 - exposed) * 0.28;
      sample.clearcoatRoughness = 0.16;
      break;
    }
    case "cookware": {
      const seasoning = clamp01(carbon * 0.82 + grime * 0.35);
      const oxideTint = clamp01(heat * amount * (0.4 + oxidation * 0.6));
      sample.baseColor = mixColor(mixColor(color, [0.025, 0.02, 0.018], seasoning), accentColor, oxideTint * 0.3);
      sample.height = 0.45 + macro * 0.08 + micro * 0.035 + seasoning * 0.025;
      sample.metallic = 0.82 - seasoning * 0.28;
      sample.roughness = clamp(roughness + micro * 0.12 - seasoning * 0.25, 0.04, 1);
      sample.ao = 1 - cavity * 0.22;
      sample.clearcoat = seasoning * 0.48;
      sample.clearcoatRoughness = 0.09 + carbon * 0.12;
      sample.iridescence = oxideTint * 0.18;
      sample.iridescenceThickness = heat;
      break;
    }
    case "shipHull": {
      const submerged = 1 - smoothstep(0.34, 0.58, v);
      const corrosion = clamp01(oxidation * 0.78 + waterline * amount * 0.58 + submerged * smoothstep(0.58, 0.82, macro) * 0.28);
      const fouling = clamp01(waterline * grime * 1.6 + submerged * smoothstep(0.55, 0.76, macro) * amount * 0.62);
      const exposed = clamp01(loss * 0.55 + corrosion * 0.35);
      sample.baseColor = mixColor(mixColor(color, accentColor, corrosion), [0.1, 0.2, 0.09], fouling);
      sample.height = 0.5 + micro * 0.035 + corrosion * 0.1 + fouling * 0.16 - exposed * 0.04;
      sample.metallic = exposed * (1 - corrosion) * 0.85;
      sample.roughness = clamp(roughness + corrosion * 0.26 + fouling * 0.18, 0.04, 1);
      sample.ao = 1 - corrosion * 0.24 - fouling * 0.25;
      sample.sheen = fouling * 0.18;
      sample.sheenColor = [0.16, 0.32, 0.12];
      break;
    }
    case "rebarConcrete": {
      const crackLine = 1 - smoothstep(0.015, 0.09, Math.abs(Math.sin((u * 0.74 + v * 0.62 + macro * 0.18) * TAU * 2)));
      const rustBleed = clamp01(oxidation * runoff * 1.4 + crackLine * oxidation * 0.7) * amount;
      sample.baseColor = mixColor(shade(color, 0.86 + micro * 0.2), accentColor, rustBleed);
      sample.height = 0.5 + micro * 0.055 - crackLine * 0.13 + rustBleed * 0.025;
      sample.metallic = crackLine * loss * 0.38;
      sample.roughness = clamp(roughness + rustBleed * 0.12 + micro * 0.08, 0.04, 1);
      sample.ao = 1 - crackLine * 0.55 - rustBleed * 0.12;
      break;
    }
    case "woodStairs": {
      const grain = Math.sin((u * scale * detail * 0.45 + macro * 1.4) * TAU) * 0.5 + 0.5;
      const dirt = grime * (1 - polish * 0.65);
      sample.baseColor = mixColor(mixColor(color, accentColor, grain * 0.52), [0.1, 0.07, 0.035], dirt * 0.5);
      sample.height = 0.42 + grain * 0.08 + micro * 0.025 - wear * 0.055;
      sample.roughness = clamp(roughness + dirt * 0.2 - polish * 0.38, 0.04, 1);
      sample.ao = 1 - dirt * 0.28;
      sample.anisotropy = 0.45 + grain * 0.28;
      sample.anisotropyRotation = 0;
      sample.clearcoat = polish * 0.35;
      sample.clearcoatRoughness = 0.12;
      break;
    }
    case "leatherSeat": {
      const pores = Math.pow(1 - micro, 5);
      const crease = Math.pow(Math.abs(Math.sin((u + macro * 0.12) * scale * TAU)), 18) * cavity;
      const compressed = clamp01(polish * 0.75 + wear * 0.35);
      sample.baseColor = mixColor(shade(color, 0.82 + macro * 0.26), accentColor, compressed * 0.38 + crease * 0.24);
      sample.height = 0.52 + micro * 0.035 - pores * 0.07 - crease * 0.1 - wear * 0.035;
      sample.roughness = clamp(roughness + pores * 0.18 - polish * 0.34, 0.04, 1);
      sample.ao = 1 - pores * 0.2 - crease * 0.32;
      sample.sheen = 0.24 + compressed * 0.4;
      sample.sheenColor = accentColor;
      sample.subsurface = 0.08;
      sample.thickness = 0.18;
      break;
    }
    case "ceramicBasin": {
      const scaleDeposit = clamp01(mineral * 0.72 + waterline * 0.5) * amount * (1 - wear * 0.5);
      const wet = clamp01(runoff * 0.45 - scaleDeposit * 0.22);
      sample.baseColor = mixColor(shade(color, 0.94 + micro * 0.08), accentColor, scaleDeposit * 0.62);
      sample.height = 0.5 + scaleDeposit * 0.055 + micro * 0.01;
      sample.roughness = clamp(roughness + scaleDeposit * 0.36 - wet * 0.25, 0.04, 1);
      sample.ao = 1 - scaleDeposit * 0.12;
      sample.clearcoat = 0.88 - scaleDeposit * 0.42;
      sample.clearcoatRoughness = 0.04 + scaleDeposit * 0.3;
      break;
    }
    case "copperRoof": {
      const seam = 1 - smoothstep(0.02, 0.11, Math.min(fract(u * scale), 1 - fract(u * scale)));
      const patina = clamp01(oxidation * 0.78 + runoff * 0.42 + seam * grime * 0.4) * amount;
      sample.baseColor = mixColor(shade(color, 0.8 + macro * 0.3), accentColor, patina);
      sample.height = 0.48 + seam * 0.08 + micro * 0.018 + patina * 0.025;
      sample.metallic = 1 - patina * 0.76;
      sample.roughness = clamp(roughness + patina * 0.34 + seam * 0.08, 0.04, 1);
      sample.ao = 1 - seam * 0.2 - grime * 0.18;
      break;
    }
    case "safetyFloor": {
      const diamondX = Math.abs(fract((u + v) * scale) - 0.5);
      const diamondY = Math.abs(fract((u - v) * scale) - 0.5);
      const tread = smoothstep(0.34, 0.47, Math.max(diamondX, diamondY));
      const exposed = clamp01(loss * 0.8 + wear * 0.42);
      const oil = grime * (0.45 + runoff * 0.55);
      sample.baseColor = mixColor(mixColor(color, accentColor, exposed), [0.035, 0.038, 0.035], oil * 0.78);
      sample.height = 0.42 + tread * 0.2 - exposed * 0.04 + micro * 0.018;
      sample.metallic = exposed * 0.92;
      sample.roughness = clamp(roughness + tread * 0.08 + exposed * 0.15 - oil * 0.35, 0.04, 1);
      sample.ao = 1 - tread * 0.18 - grime * 0.22;
      sample.clearcoat = oil * 0.42;
      sample.clearcoatRoughness = 0.08 + grime * 0.18;
      break;
    }
  }
  return sample;
}

function buildSeventhBatchMaterialResult(
  definition: SeventhBatchMaterialDefinition,
  size: number,
  params: SeventhBatchMaterialParams = {},
): { material: LayeredMaterial; lifecycle: AssetLifecycleMaps } {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const amount = clamp01(params.amount ?? definition.amount);
  const time = clamp01(params.time ?? definition.time);
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughnessValue = params.roughness ?? definition.roughness;
  const maps = prepareMaps(definition, size, seed, scale, time);
  const noise = makeNoise(seed);
  const detailNoise = makeNoise(seed + 137);
  const baseColor = makeTexture(size, size, 3);
  const metallic = makeTexture(size, size, 1);
  const roughness = makeTexture(size, size, 1);
  const ao = makeTexture(size, size, 1);
  const height = makeTexture(size, size, 1);
  const emission = makeTexture(size, size, 3);
  const opacity = makeTexture(size, size, 1);
  const transmission = makeTexture(size, size, 1);
  const anisotropy = makeTexture(size, size, 1);
  const anisotropyRotation = makeTexture(size, size, 1);
  const clearcoat = makeTexture(size, size, 1);
  const clearcoatRoughness = makeTexture(size, size, 1);
  const sheen = makeTexture(size, size, 1);
  const sheenColor = makeTexture(size, size, 3);
  const thicknessMap = makeTexture(size, size, 1);
  const subsurface = makeTexture(size, size, 1);
  const iridescence = makeTexture(size, size, 1);
  const iridescenceThickness = makeTexture(size, size, 1);

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const pixel = y * size + x;
      const sample = sampleMaterial(
        definition, maps, noise, detailNoise, u, v, pixel,
        scale, detail, amount, color, accentColor, roughnessValue,
      );
      writeColor(baseColor, pixel, sample.baseColor);
      metallic.data[pixel] = clamp01(sample.metallic);
      roughness.data[pixel] = clamp(sample.roughness, 0.04, 1);
      ao.data[pixel] = clamp01(sample.ao);
      height.data[pixel] = clamp01(sample.height);
      writeColor(emission, pixel, sample.emission);
      opacity.data[pixel] = clamp01(sample.opacity);
      transmission.data[pixel] = clamp01(sample.transmission);
      anisotropy.data[pixel] = clamp01(sample.anisotropy);
      anisotropyRotation.data[pixel] = clamp01(sample.anisotropyRotation);
      clearcoat.data[pixel] = clamp01(sample.clearcoat);
      clearcoatRoughness.data[pixel] = clamp01(sample.clearcoatRoughness);
      sheen.data[pixel] = clamp01(sample.sheen);
      writeColor(sheenColor, pixel, sample.sheenColor);
      thicknessMap.data[pixel] = clamp01(sample.thickness);
      subsurface.data[pixel] = clamp01(sample.subsurface);
      iridescence.data[pixel] = clamp01(sample.iridescence);
      iridescenceThickness.data[pixel] = clamp01(sample.iridescenceThickness);
    }
  }

  const extended = assembleExtendedMaterial({
    baseColor,
    metallic,
    roughness,
    normal: heightToNormal(height, definition.normalStrength),
    ao,
    height,
    emission,
  }, {
    opacity,
    transmission,
    anisotropy,
    anisotropyRotation,
    physical: definition.physical,
  }, definition.normalStrength);
  const material = assembleLayeredMaterial(extended, {
    clearcoat,
    clearcoatRoughness,
    sheen,
    sheenColor,
    thicknessMap,
    subsurface,
    iridescence,
    iridescenceThickness,
  }, definition.physical);
  return { material, lifecycle: maps.lifecycle };
}

export function buildSeventhBatchMaterial(
  definition: SeventhBatchMaterialDefinition,
  size: number,
  params: SeventhBatchMaterialParams = {},
): LayeredMaterial {
  return buildSeventhBatchMaterialResult(definition, size, params).material;
}

const physicalBase: LayeredMaterialPhysical = {
  ior: 1.5,
  thickness: 0,
  emissiveIntensity: 1,
  alphaCutoff: 0,
  clearcoat: 0,
  clearcoatRoughness: 0.1,
  sheen: 0,
  sheenRoughness: 0.5,
  iridescence: 0,
  iridescenceIor: 1.3,
  subsurface: 0,
  attenuationDistance: 1,
  attenuationColor: [1, 1, 1],
};

export const SEVENTH_BATCH_MATERIAL_DEFINITIONS = {
  contactPolishedBrass: { label: "接触抛光黄铜", focus: "手持接触、凹腔积污与局部抛光", kind: "handledBrass", seed: 701, scale: 7, detail: 7, amount: 0.86, time: 0.82, color: [0.58, 0.36, 0.08], accentColor: [0.08, 0.29, 0.22], roughness: 0.34, normalStrength: 5, lifecycle: { moisture: 0.52, traffic: 0.95, cleaning: 0.22 }, physical: { ...physicalBase, clearcoat: 0.32 } },
  chippedPaintedToolSteel: { label: "崩漆工具钢", focus: "负载边缘、握持油污与钢基暴露", kind: "paintedTool", seed: 702, scale: 8, detail: 7, amount: 0.9, time: 0.86, color: [0.72, 0.08, 0.035], accentColor: [0.31, 0.34, 0.35], roughness: 0.42, normalStrength: 7, lifecycle: { moisture: 0.35, traffic: 0.92, cleaning: 0.18 }, physical: { ...physicalBase, clearcoat: 0.28 } },
  seasonedCastIronCookware: { label: "热区养锅铸铁", focus: "热影响、积碳、油膜与铸造微孔", kind: "cookware", seed: 703, scale: 7, detail: 8, amount: 0.84, time: 0.88, color: [0.12, 0.105, 0.095], accentColor: [0.36, 0.12, 0.035], roughness: 0.54, normalStrength: 7, lifecycle: { moisture: 0.18, traffic: 0.5, temperature: 0.95, cleaning: 0.12 }, physical: { ...physicalBase, clearcoat: 0.45, iridescence: 0.16 } },
  biofouledShipHull: { label: "水线附着船体", focus: "水线、盐雾锈蚀、海生附着与掉漆", kind: "shipHull", seed: 704, scale: 7, detail: 7, amount: 0.9, time: 0.9, color: [0.08, 0.24, 0.38], accentColor: [0.58, 0.2, 0.055], roughness: 0.48, normalStrength: 10, lifecycle: { moisture: 0.96, salinity: 1, traffic: 0.35, cleaning: 0.05 }, physical: physicalBase },
  rustBleedRebarConcrete: { label: "钢筋锈胀渗色混凝土", focus: "裂缝、钢筋锈胀、雨流渗色与剥落", kind: "rebarConcrete", seed: 705, scale: 8, detail: 7, amount: 0.88, time: 0.84, color: [0.52, 0.51, 0.48], accentColor: [0.54, 0.18, 0.045], roughness: 0.74, normalStrength: 9, lifecycle: { moisture: 0.78, salinity: 0.28, traffic: 0.22, cleaning: 0.02 }, physical: physicalBase },
  trafficPolishedWoodStairs: { label: "人流抛光木楼梯", focus: "双脚路径、踏步压实、积尘与木纹方向", kind: "woodStairs", seed: 706, scale: 6, detail: 8, amount: 0.82, time: 0.78, color: [0.34, 0.14, 0.045], accentColor: [0.68, 0.34, 0.1], roughness: 0.55, normalStrength: 6, lifecycle: { moisture: 0.28, traffic: 1, cleaning: 0.34 }, physical: { ...physicalBase, clearcoat: 0.35 } },
  compressedVehicleLeather: { label: "乘坐压痕车座皮革", focus: "人体接触、压实发亮、皱褶与毛孔", kind: "leatherSeat", seed: 707, scale: 7, detail: 9, amount: 0.84, time: 0.8, color: [0.09, 0.055, 0.035], accentColor: [0.38, 0.16, 0.07], roughness: 0.5, normalStrength: 8, lifecycle: { moisture: 0.22, traffic: 0.95, cleaning: 0.25 }, physical: { ...physicalBase, sheen: 0.55, subsurface: 0.08, thickness: 0.18 } },
  limescaleCeramicBasin: { label: "水垢陶瓷盆", focus: "水线、滴流、矿物沉积与清洁擦除", kind: "ceramicBasin", seed: 708, scale: 7, detail: 7, amount: 0.82, time: 0.74, color: [0.88, 0.9, 0.88], accentColor: [0.58, 0.55, 0.43], roughness: 0.16, normalStrength: 4, lifecycle: { moisture: 0.92, temperature: 0.58, traffic: 0.48, cleaning: 0.34 }, physical: { ...physicalBase, clearcoat: 0.9, clearcoatRoughness: 0.05 } },
  rainPatinatedCopperRoof: { label: "雨流铜绿屋面", focus: "板缝、朝向暴露、雨流与铜绿传播", kind: "copperRoof", seed: 709, scale: 7, detail: 7, amount: 0.9, time: 0.88, color: [0.5, 0.19, 0.055], accentColor: [0.08, 0.46, 0.33], roughness: 0.38, normalStrength: 6, lifecycle: { moisture: 0.88, salinity: 0.22, traffic: 0.08, cleaning: 0.02 }, physical: physicalBase },
  trafficWornSafetyFloor: { label: "交通磨耗安全地坪", focus: "车辆通道、防滑纹、油污与底钢暴露", kind: "safetyFloor", seed: 710, scale: 8, detail: 7, amount: 0.9, time: 0.86, color: [0.86, 0.62, 0.035], accentColor: [0.31, 0.34, 0.35], roughness: 0.58, normalStrength: 10, lifecycle: { moisture: 0.32, traffic: 1, cleaning: 0.12 }, physical: { ...physicalBase, clearcoat: 0.36 } },
} satisfies Record<string, SeventhBatchMaterialDefinition>;

export type SeventhBatchMaterialName = keyof typeof SEVENTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: SeventhBatchMaterialName) {
  return (size: number, params: SeventhBatchMaterialParams = {}) => (
    buildSeventhBatchMaterial(SEVENTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const SEVENTH_BATCH_MATERIALS = {
  contactPolishedBrass: builder("contactPolishedBrass"),
  chippedPaintedToolSteel: builder("chippedPaintedToolSteel"),
  seasonedCastIronCookware: builder("seasonedCastIronCookware"),
  biofouledShipHull: builder("biofouledShipHull"),
  rustBleedRebarConcrete: builder("rustBleedRebarConcrete"),
  trafficPolishedWoodStairs: builder("trafficPolishedWoodStairs"),
  compressedVehicleLeather: builder("compressedVehicleLeather"),
  limescaleCeramicBasin: builder("limescaleCeramicBasin"),
  rainPatinatedCopperRoof: builder("rainPatinatedCopperRoof"),
  trafficWornSafetyFloor: builder("trafficWornSafetyFloor"),
};

export const SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(SEVENTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "作用强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "time", label: "使用年限", type: "range", min: 0, max: 1, step: 0.01, default: definition.time },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies SeventhBatchMaterialParamSpec[]]),
) as Record<SeventhBatchMaterialName, SeventhBatchMaterialParamSpec[]>;

export function defaultSeventhBatchMaterialParams(name: SeventhBatchMaterialName): SeventhBatchMaterialParams {
  const params: SeventhBatchMaterialParams = {};
  for (const spec of SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}

export function buildSeventhBatchMaterialWithLifecycle(
  name: SeventhBatchMaterialName,
  size: number,
  params: SeventhBatchMaterialParams = {},
): { material: LayeredMaterial; lifecycle: AssetLifecycleMaps } {
  const definition = SEVENTH_BATCH_MATERIAL_DEFINITIONS[name];
  return buildSeventhBatchMaterialResult(definition, size, params);
}
