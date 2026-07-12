import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial } from "./material-mechanics.js";
import { blendColor } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import {
  computeTerrainBlendWeights,
  projectSdfDecals,
  simulateSurfaceEvolution,
  type SurfaceEvolutionOptions,
  type SurfaceEvolutionResult,
} from "./scene-material-mechanics.js";
import {
  assembleLayeredMaterial,
  type LayeredMaterial,
  type LayeredMaterialPhysical,
} from "./shading-mechanics.js";

type RGB = [number, number, number];

type SixthBatchMaterialKind =
  | "mossyRock"
  | "rainConcrete"
  | "snowRuts"
  | "marineSteel"
  | "terrainBlend"
  | "hangarFloor"
  | "windSandstone"
  | "tireRubber"
  | "agedPlastic"
  | "graffitiWall";

export interface SixthBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  time?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface SixthBatchMaterialParamSpec {
  key: keyof SixthBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface SixthBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: SixthBatchMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  time: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  normalStrength: number;
  evolution: SurfaceEvolutionOptions;
  physical: LayeredMaterialPhysical;
}

interface PreparedMaps {
  evolution: SurfaceEvolutionResult;
  terrainWeights: TextureBuffer;
  decals: TextureBuffer;
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

function prepareMaps(
  definition: SixthBatchMaterialDefinition,
  size: number,
  seed: number,
  scale: number,
  amount: number,
  time: number,
): PreparedMaps {
  const evolution = simulateSurfaceEvolution(size, {
    ...definition.evolution,
    seed,
    time,
    iterations: 2 + Math.round(time * 3),
  });
  const noise = makeNoise(seed + 93);
  const terrainHeight = makeTexture(size, size, 1);
  const terrainSlope = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const pixel = y * size + x;
      const height = fbm2(noise, u * scale * 0.45, v * scale * 0.45, { octaves: 5 }) * 0.5 + 0.5;
      terrainHeight.data[pixel] = height;
      terrainSlope.data[pixel] = clamp01(Math.abs(noise.noise2(u * scale, v * scale)) * 1.4);
    }
  }
  const terrainWeights = computeTerrainBlendWeights(
    terrainHeight,
    terrainSlope,
    evolution.moisture,
    [
      { maxSlope: 0.4, moisturePreference: 0.72, sharpness: 7 },
      { minSlope: 0.18, maxSlope: 0.72, moisturePreference: 0.45, sharpness: 6 },
      { minSlope: 0.55, moisturePreference: 0.24, sharpness: 8 },
      { minHeight: 0.72, maxSlope: 0.48, moisturePreference: 0.58, sharpness: 9 },
    ],
  );
  const decals = projectSdfDecals(size, [
    { shape: "stripe", center: [0.34, 0.52], size: [0.23, 0.045], rotation: -0.18, softness: 0.08, opacity: amount },
    { shape: "ring", center: [0.62, 0.55], size: [0.2, 0.16], rotation: 0.12, softness: 0.06, opacity: amount * 0.9 },
    { shape: "box", center: [0.5, 0.36], size: [0.27, 0.035], rotation: 0.08, softness: 0.08, opacity: amount * 0.75 },
  ]);
  return { evolution, terrainWeights, decals };
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
  definition: SixthBatchMaterialDefinition,
  maps: PreparedMaps,
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
  const moisture = maps.evolution.moisture.data[pixel]!;
  const growth = maps.evolution.growth.data[pixel]!;
  const corrosion = maps.evolution.corrosion.data[pixel]!;
  const sediment = maps.evolution.sediment.data[pixel]!;
  const wear = maps.evolution.wear.data[pixel]!;
  const cracking = maps.evolution.cracking.data[pixel]!;
  switch (definition.kind) {
    case "mossyRock": {
      const crevice = smoothstep(0.58, 0.9, 1 - macro) * amount;
      const moss = smoothstep(0.22, 0.6, growth * 1.2 + crevice * moisture * 0.55);
      sample.baseColor = mixColor(shade(color, 0.72 + macro * 0.48), accentColor, moss);
      sample.height = clamp01(0.34 + macro * 0.32 + micro * 0.08 + moss * 0.14);
      sample.roughness = clamp(roughness + moss * 0.18 - moisture * 0.16, 0.08, 1);
      sample.ao = 1 - crevice * 0.4;
      sample.sheen = moss * 0.22;
      sample.sheenColor = accentColor;
      break;
    }
    case "rainConcrete": {
      const streak = Math.pow(Math.max(0, noise.noise2(u * scale * 0.55, v * scale * 5) * 0.5 + 0.5), 3);
      const rain = clamp01(moisture * 0.7 + sediment * 0.65 + streak * amount * 0.35);
      sample.baseColor = mixColor(shade(color, 0.8 + micro * 0.25), accentColor, rain * 0.55);
      sample.height = clamp01(0.5 + micro * 0.09 - rain * 0.07 - cracking * 0.12);
      sample.roughness = clamp(roughness - moisture * 0.45 + sediment * 0.18, 0.08, 1);
      sample.ao = 1 - rain * 0.3 - cracking * 0.2;
      sample.clearcoat = moisture * 0.35;
      sample.clearcoatRoughness = 0.12;
      break;
    }
    case "snowRuts": {
      const lane = Math.min(
        Math.abs(fract(u * 2 + 0.15) - 0.27),
        Math.abs(fract(u * 2 + 0.15) - 0.73),
      );
      const tread = smoothstep(0.15, 0.03, lane) * (0.55 + Math.sin(v * scale * TAU * 2) * 0.25);
      const compacted = clamp01(tread * amount + wear * 0.55);
      const dirt = compacted * (0.45 + sediment * 0.55);
      sample.baseColor = mixColor(mixColor(color, [0.62, 0.66, 0.64], dirt), accentColor, moisture * compacted * 0.35);
      sample.height = clamp01(0.58 + macro * 0.12 + micro * 0.04 - compacted * 0.3);
      sample.roughness = clamp(roughness - compacted * moisture * 0.4, 0.08, 1);
      sample.subsurface = (1 - compacted) * 0.22;
      sample.thickness = 0.25 + (1 - compacted) * 0.42;
      break;
    }
    case "marineSteel": {
      const barnacleCells = Math.pow(Math.max(0, detailNoise.noise2(u * scale * 2, v * scale * 2) * 0.5 + 0.5), 6);
      const rust = smoothstep(0.34, 0.78, corrosion * 0.82 + sediment * 0.24);
      const growthMask = smoothstep(0.36, 0.82, growth * 0.62 + barnacleCells * moisture * amount);
      sample.baseColor = mixColor(mixColor(color, [0.36, 0.12, 0.035], rust), accentColor, growthMask);
      sample.height = clamp01(0.46 + rust * micro * 0.2 + growthMask * 0.24 - cracking * 0.08);
      sample.metallic = clamp01(1 - rust * 0.9 - growthMask);
      sample.roughness = clamp(roughness + rust * 0.45 + growthMask * 0.2, 0.08, 1);
      sample.ao = 1 - growthMask * 0.42;
      break;
    }
    case "terrainBlend": {
      const grass = maps.terrainWeights.data[pixel * 4]!;
      const mud = maps.terrainWeights.data[pixel * 4 + 1]!;
      const rock = maps.terrainWeights.data[pixel * 4 + 2]!;
      const snow = maps.terrainWeights.data[pixel * 4 + 3]!;
      const grassColor: RGB = accentColor;
      const mudColor: RGB = [0.23, 0.13, 0.055];
      const rockColor: RGB = color;
      const snowColor: RGB = [0.88, 0.91, 0.94];
      sample.baseColor = [
        grassColor[0] * grass + mudColor[0] * mud + rockColor[0] * rock + snowColor[0] * snow,
        grassColor[1] * grass + mudColor[1] * mud + rockColor[1] * rock + snowColor[1] * snow,
        grassColor[2] * grass + mudColor[2] * mud + rockColor[2] * rock + snowColor[2] * snow,
      ];
      sample.height = clamp01(0.36 + macro * 0.22 + grass * micro * 0.12 + rock * 0.14 + snow * 0.08);
      sample.roughness = clamp(0.55 + grass * 0.24 + snow * 0.2 - mud * moisture * 0.32, 0.08, 1);
      sample.subsurface = snow * 0.18;
      break;
    }
    case "hangarFloor": {
      const expansion = Math.min(Math.abs(fract(u * 3) - 0.5), Math.abs(fract(v * 3) - 0.5));
      const joint = smoothstep(0.045, 0.008, expansion);
      const spill = clamp01(moisture * amount * 1.1 + Math.pow(macro, 5) * 0.5);
      const tire = wear * smoothstep(0.42, 0.6, Math.sin((u + v * 0.12) * TAU * 3) * 0.5 + 0.5);
      sample.baseColor = mixColor(mixColor(color, accentColor, spill * 0.6), [0.035, 0.038, 0.04], tire);
      sample.height = clamp01(0.52 + micro * 0.035 - joint * 0.18 + sediment * 0.04);
      sample.roughness = clamp(roughness - spill * 0.5 + sediment * 0.2, 0.06, 1);
      sample.ao = 1 - joint * 0.55;
      sample.clearcoat = spill * 0.45;
      sample.clearcoatRoughness = 0.08 + sediment * 0.2;
      break;
    }
    case "windSandstone": {
      const angle = -0.22;
      const along = u * Math.cos(angle) + v * Math.sin(angle);
      const layers = Math.sin((v + noise.noise2(u * 2, v * 2) * 0.08) * scale * TAU * 2) * 0.5 + 0.5;
      const fluting = Math.pow(Math.sin(along * scale * TAU) * 0.5 + 0.5, 3);
      sample.baseColor = mixColor(shade(color, 0.72 + layers * 0.5), accentColor, sediment * 0.45 + fluting * 0.18);
      sample.height = clamp01(0.34 + layers * 0.28 + fluting * amount * 0.16 + micro * 0.04 - wear * 0.08);
      sample.roughness = clamp(roughness + sediment * 0.16 - wear * 0.08, 0.12, 1);
      sample.anisotropy = 0.32 + amount * 0.28;
      sample.anisotropyRotation = fract(angle / TAU + 1);
      break;
    }
    case "tireRubber": {
      const center = Math.abs(u - 0.5);
      const zigzag = Math.abs(fract(v * scale * 1.5 + Math.sin(u * TAU * 2) * 0.18) - 0.5);
      const groove = Math.max(
        smoothstep(0.09, 0.025, Math.abs(center - 0.22)),
        smoothstep(0.16, 0.04, zigzag) * smoothstep(0.48, 0.08, center),
      );
      const abraded = wear * amount;
      sample.baseColor = mixColor(shade(color, 0.72 + micro * 0.22), accentColor, sediment * 0.45);
      sample.height = clamp01(0.56 + (1 - groove) * 0.16 - groove * 0.22 - abraded * 0.09 + micro * 0.025);
      sample.roughness = clamp(roughness + sediment * 0.2 - moisture * 0.25, 0.12, 1);
      sample.ao = 1 - groove * 0.5;
      sample.sheen = 0.16 + (1 - abraded) * 0.12;
      sample.sheenColor = [0.14, 0.14, 0.15];
      break;
    }
    case "agedPlastic": {
      const bleach = clamp01(wear * 0.8 + macro * amount * 0.35);
      const craze = cracking * amount;
      sample.baseColor = mixColor(mixColor(color, accentColor, bleach * 0.68), [0.78, 0.8, 0.78], craze * 0.45);
      sample.height = clamp01(0.5 + micro * 0.035 - craze * 0.11);
      sample.roughness = clamp(roughness + bleach * 0.35 + craze * 0.18, 0.08, 1);
      sample.ao = 1 - craze * 0.18;
      sample.clearcoat = clamp01(0.38 * (1 - bleach));
      sample.clearcoatRoughness = 0.12 + bleach * 0.28;
      break;
    }
    case "graffitiWall": {
      const decal = maps.decals.data[pixel]!;
      const peel = clamp01(cracking * 0.75 + wear * 0.35);
      const paint = decal * (1 - peel) * amount;
      const wall = shade(color, 0.75 + macro * 0.38);
      sample.baseColor = mixColor(wall, accentColor, paint);
      sample.height = clamp01(0.47 + micro * 0.07 + paint * 0.045 - cracking * 0.1);
      sample.roughness = clamp(roughness - paint * 0.2 + peel * 0.22, 0.08, 1);
      sample.ao = 1 - cracking * 0.3;
      sample.clearcoat = paint * 0.22;
      sample.clearcoatRoughness = 0.18;
      break;
    }
  }
  return sample;
}

export function buildSixthBatchMaterial(
  definition: SixthBatchMaterialDefinition,
  size: number,
  params: SixthBatchMaterialParams = {},
): LayeredMaterial {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const amount = clamp01(params.amount ?? definition.amount);
  const time = clamp01(params.time ?? definition.time);
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughnessValue = params.roughness ?? definition.roughness;
  const maps = prepareMaps(definition, size, seed, scale, amount, time);
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
      const materialSample = sampleMaterial(
        definition, maps, noise, detailNoise, u, v, pixel,
        scale, detail, amount, color, accentColor, roughnessValue,
      );
      writeColor(baseColor, pixel, materialSample.baseColor);
      metallic.data[pixel] = clamp01(materialSample.metallic);
      roughness.data[pixel] = clamp(materialSample.roughness, 0.04, 1);
      ao.data[pixel] = clamp01(materialSample.ao);
      height.data[pixel] = clamp01(materialSample.height);
      writeColor(emission, pixel, materialSample.emission);
      opacity.data[pixel] = clamp01(materialSample.opacity);
      transmission.data[pixel] = clamp01(materialSample.transmission);
      anisotropy.data[pixel] = clamp01(materialSample.anisotropy);
      anisotropyRotation.data[pixel] = clamp01(materialSample.anisotropyRotation);
      clearcoat.data[pixel] = clamp01(materialSample.clearcoat);
      clearcoatRoughness.data[pixel] = clamp01(materialSample.clearcoatRoughness);
      sheen.data[pixel] = clamp01(materialSample.sheen);
      writeColor(sheenColor, pixel, materialSample.sheenColor);
      thicknessMap.data[pixel] = clamp01(materialSample.thickness);
      subsurface.data[pixel] = clamp01(materialSample.subsurface);
      iridescence.data[pixel] = clamp01(materialSample.iridescence);
      iridescenceThickness.data[pixel] = clamp01(materialSample.iridescenceThickness);
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
  return assembleLayeredMaterial(extended, {
    clearcoat,
    clearcoatRoughness,
    sheen,
    sheenColor,
    thicknessMap,
    subsurface,
    iridescence,
    iridescenceThickness,
  }, definition.physical);
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

export const SIXTH_BATCH_MATERIAL_DEFINITIONS = {
  sceneAwareMossyRock: { label: "场景感知苔藓岩石", focus: "湿度、朝向、光照与凹腔驱动生长", kind: "mossyRock", seed: 601, scale: 6, detail: 6, amount: 0.9, time: 0.78, color: [0.3, 0.31, 0.28], accentColor: [0.12, 0.31, 0.08], roughness: 0.72, normalStrength: 8, evolution: { humidity: 0.85, sunlight: 0.28, temperature: 0.48, wind: [0.15, -0.4] }, physical: { ...physicalBase, sheen: 0.2 } },
  rainWashedConcrete: { label: "雨淋吸水混凝土", focus: "雨流、吸水、干燥与污迹沉积", kind: "rainConcrete", seed: 602, scale: 7, detail: 7, amount: 0.88, time: 0.82, color: [0.48, 0.49, 0.47], accentColor: [0.16, 0.19, 0.16], roughness: 0.7, normalStrength: 7, evolution: { humidity: 0.82, sunlight: 0.38, temperature: 0.44, wind: [0.03, -1] }, physical: physicalBase },
  compactedSnowRuts: { label: "压实融化积雪车辙", focus: "覆盖、压实、车辙位移与融化湿痕", kind: "snowRuts", seed: 603, scale: 6, detail: 5, amount: 0.92, time: 0.68, color: [0.9, 0.93, 0.95], accentColor: [0.22, 0.28, 0.27], roughness: 0.82, normalStrength: 10, evolution: { humidity: 0.74, sunlight: 0.52, temperature: 0.58, traffic: 0.95, wind: [0.1, -0.25] }, physical: { ...physicalBase, subsurface: 0.2, thickness: 0.5 } },
  marineCorrodedSteel: { label: "海洋腐蚀附着钢", focus: "盐雾、锈蚀、藤壶与生物附着", kind: "marineSteel", seed: 604, scale: 7, detail: 7, amount: 0.9, time: 0.88, color: [0.34, 0.38, 0.4], accentColor: [0.24, 0.3, 0.14], roughness: 0.4, normalStrength: 11, evolution: { humidity: 0.94, salinity: 0.95, sunlight: 0.42, temperature: 0.55, wind: [0.55, -0.2] }, physical: physicalBase },
  slopeHeightTerrainBlend: { label: "坡度高度地形混合", focus: "草、泥、岩石、积雪归一权重混合", kind: "terrainBlend", seed: 605, scale: 6, detail: 6, amount: 0.84, time: 0.62, color: [0.37, 0.35, 0.3], accentColor: [0.2, 0.36, 0.11], roughness: 0.68, normalStrength: 9, evolution: { humidity: 0.58, sunlight: 0.55, temperature: 0.45, wind: [0.2, -0.2] }, physical: physicalBase },
  hangarOilStainedFloor: { label: "机库油污磨耗地面", focus: "泄漏扩散、轮胎印与灰尘擦除", kind: "hangarFloor", seed: 606, scale: 8, detail: 8, amount: 0.88, time: 0.82, color: [0.36, 0.37, 0.35], accentColor: [0.08, 0.095, 0.09], roughness: 0.66, normalStrength: 6, evolution: { humidity: 0.4, traffic: 0.92, sunlight: 0.18, temperature: 0.5, wind: [0.3, -0.1] }, physical: { ...physicalBase, clearcoat: 0.35 } },
  windErodedSandstone: { label: "风蚀层理砂岩", focus: "风向输运、层理沉积与侵蚀槽", kind: "windSandstone", seed: 607, scale: 7, detail: 6, amount: 0.86, time: 0.84, color: [0.58, 0.31, 0.14], accentColor: [0.82, 0.56, 0.27], roughness: 0.78, normalStrength: 10, evolution: { humidity: 0.16, sunlight: 0.9, temperature: 0.72, wind: [0.96, -0.22] }, physical: physicalBase },
  wornMudTireRubber: { label: "磨耗泥水轮胎橡胶", focus: "胎纹、接触磨耗与泥水附着", kind: "tireRubber", seed: 608, scale: 8, detail: 7, amount: 0.9, time: 0.78, color: [0.035, 0.038, 0.042], accentColor: [0.2, 0.13, 0.06], roughness: 0.6, normalStrength: 12, evolution: { humidity: 0.62, traffic: 1, sunlight: 0.42, temperature: 0.58, wind: [0.15, -0.25] }, physical: { ...physicalBase, sheen: 0.25 } },
  uvAgedPlastic: { label: "紫外老化脆裂塑料", focus: "紫外褪色、发白、划痕与脆裂", kind: "agedPlastic", seed: 609, scale: 7, detail: 7, amount: 0.86, time: 0.9, color: [0.08, 0.25, 0.48], accentColor: [0.3, 0.48, 0.62], roughness: 0.42, normalStrength: 7, evolution: { humidity: 0.3, sunlight: 1, temperature: 0.78, traffic: 0.28, wind: [0.4, -0.12] }, physical: { ...physicalBase, clearcoat: 0.35, clearcoatRoughness: 0.18 } },
  layeredGraffitiWall: { label: "分层剥落涂鸦墙", focus: "SDF 贴花、覆盖顺序与风化剥落融合", kind: "graffitiWall", seed: 610, scale: 8, detail: 7, amount: 0.94, time: 0.82, color: [0.54, 0.5, 0.43], accentColor: [0.84, 0.08, 0.24], roughness: 0.72, normalStrength: 8, evolution: { humidity: 0.55, sunlight: 0.75, temperature: 0.55, traffic: 0.22, wind: [0.35, -0.45] }, physical: { ...physicalBase, clearcoat: 0.2 } },
} satisfies Record<string, SixthBatchMaterialDefinition>;

export type SixthBatchMaterialName = keyof typeof SIXTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: SixthBatchMaterialName) {
  return (size: number, params: SixthBatchMaterialParams = {}) => (
    buildSixthBatchMaterial(SIXTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const SIXTH_BATCH_MATERIALS = {
  sceneAwareMossyRock: builder("sceneAwareMossyRock"),
  rainWashedConcrete: builder("rainWashedConcrete"),
  compactedSnowRuts: builder("compactedSnowRuts"),
  marineCorrodedSteel: builder("marineCorrodedSteel"),
  slopeHeightTerrainBlend: builder("slopeHeightTerrainBlend"),
  hangarOilStainedFloor: builder("hangarOilStainedFloor"),
  windErodedSandstone: builder("windErodedSandstone"),
  wornMudTireRubber: builder("wornMudTireRubber"),
  uvAgedPlastic: builder("uvAgedPlastic"),
  layeredGraffitiWall: builder("layeredGraffitiWall"),
};

export const SIXTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(SIXTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "作用强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "time", label: "演化时间", type: "range", min: 0, max: 1, step: 0.01, default: definition.time },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies SixthBatchMaterialParamSpec[]]),
) as Record<SixthBatchMaterialName, SixthBatchMaterialParamSpec[]>;

export function defaultSixthBatchMaterialParams(name: SixthBatchMaterialName): SixthBatchMaterialParams {
  const params: SixthBatchMaterialParams = {};
  for (const spec of SIXTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}
