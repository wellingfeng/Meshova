import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial } from "./material-mechanics.js";
import {
  depositCurves,
  diffractionColor,
  growGrains,
  makeDualAnisotropyField,
  simulateDroplets,
  simulateManufacturing,
  spectralIor,
  temperatureOxideColor,
  type ManufacturingMode,
} from "./manufacturing-mechanics.js";
import { blendColor } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import {
  assembleLayeredMaterial,
  type LayeredMaterial,
  type LayeredMaterialPhysical,
} from "./shading-mechanics.js";

type RGB = [number, number, number];

type FifthBatchMaterialKind =
  | "carbonFiber"
  | "damascusSteel"
  | "weldedSteel"
  | "galvanizedSteel"
  | "cutGem"
  | "holographicFilm"
  | "laminatedWood"
  | "powderCoat"
  | "contamination"
  | "firedClay";

export interface FifthBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface FifthBatchMaterialParamSpec {
  key: keyof FifthBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface FifthBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: FifthBatchMaterialKind;
  process: ManufacturingMode;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  normalStrength: number;
  physical: LayeredMaterialPhysical;
}

interface PreparedMaps {
  grainId: TextureBuffer;
  grainBoundary: TextureBuffer;
  grainOrientation: TextureBuffer;
  weld: TextureBuffer;
  weldDirection: TextureBuffer;
  droplets: TextureBuffer;
  wetness: TextureBuffer;
  residue: TextureBuffer;
  processHeight: TextureBuffer;
  processRoughness: TextureBuffer;
  processHeat: TextureBuffer;
  processDeposit: TextureBuffer;
  primaryDirection: TextureBuffer;
  secondaryDirection: TextureBuffer;
  primaryAnisotropy: TextureBuffer;
  secondaryAnisotropy: TextureBuffer;
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

function directionRotation(texture: TextureBuffer, pixel: number): number {
  const x = texture.data[pixel * 2]! * 2 - 1;
  const y = texture.data[pixel * 2 + 1]! * 2 - 1;
  return fract(Math.atan2(y, x) / TAU + 1);
}

function writeColor(texture: TextureBuffer, pixel: number, color: RGB): void {
  texture.data[pixel * 3] = clamp01(color[0]);
  texture.data[pixel * 3 + 1] = clamp01(color[1]);
  texture.data[pixel * 3 + 2] = clamp01(color[2]);
}

function flatTexture(size: number, value: number, channels = 1): TextureBuffer {
  const texture = makeTexture(size, size, channels);
  texture.data.fill(value);
  return texture;
}

function prepareMaps(
  definition: FifthBatchMaterialDefinition,
  size: number,
  seed: number,
  scale: number,
  amount: number,
): PreparedMaps {
  const needsGrain = definition.kind === "galvanizedSteel";
  const needsWeld = definition.kind === "weldedSteel" || definition.kind === "firedClay";
  const needsDroplets = definition.kind === "contamination";
  const needsProcess = definition.kind === "damascusSteel"
    || definition.kind === "weldedSteel"
    || definition.kind === "powderCoat"
    || definition.kind === "firedClay";
  const needsFibers = definition.kind === "carbonFiber";
  const grain = needsGrain ? growGrains(size, {
    seed: seed + 11,
    grains: Math.max(6, Math.round(scale * 3.5)),
    iterations: 2,
    boundaryWidth: 1.2,
  }) : {
    grainId: flatTexture(size, 0.5),
    boundary: flatTexture(size, 0),
    orientation: flatTexture(size, 0),
  };
  const weld = needsWeld ? depositCurves(size, {
    seed: seed + 23,
    curves: definition.kind === "firedClay" ? 5 : 2,
    width: definition.kind === "firedClay" ? 0.025 : 0.055,
    frequency: definition.kind === "firedClay" ? 0.65 : 1.8,
    waviness: definition.kind === "firedClay" ? 0.08 : 0.025,
    beadFrequency: definition.kind === "firedClay" ? 5 : 24,
    vertical: definition.kind === "firedClay",
  }) : {
    deposit: flatTexture(size, 0),
    centerline: flatTexture(size, 0),
    direction: flatTexture(size, 0.5, 2),
  };
  const droplets = needsDroplets ? simulateDroplets(size, {
    seed: seed + 37,
    count: Math.max(8, Math.round(scale * 5)),
    radius: 0.025 + amount * 0.018,
    mergeIterations: 3,
    evaporation: 0.35,
  }) : {
    height: flatTexture(size, 0.5),
    wetness: flatTexture(size, 0),
    residue: flatTexture(size, 0),
  };
  const process = needsProcess ? simulateManufacturing(size, definition.process, {
    seed: seed + 49,
    scale,
    intensity: amount,
    direction: definition.kind === "laminatedWood" ? Math.PI * 0.5 : 0,
    temperature: amount,
    particles: scale * 4,
  }) : {
    height: flatTexture(size, 0.5),
    roughness: flatTexture(size, definition.roughness),
    heat: flatTexture(size, 0),
    deposit: flatTexture(size, 0),
    direction: flatTexture(size, 0.5, 2),
  };
  const fibers = needsFibers ? makeDualAnisotropyField(size, {
    seed: seed + 61,
    angle: Math.PI * 0.25,
    turbulence: 0.12,
    scale,
    weaveFrequency: scale * 2.5,
    primaryStrength: 0.95,
    secondaryStrength: 0.72,
  }) : {
    primaryDirection: process.direction,
    secondaryDirection: process.direction,
    primaryStrength: flatTexture(size, 0),
    secondaryStrength: flatTexture(size, 0),
    crossing: flatTexture(size, 0),
  };
  return {
    grainId: grain.grainId,
    grainBoundary: grain.boundary,
    grainOrientation: grain.orientation,
    weld: weld.deposit,
    weldDirection: weld.direction,
    droplets: droplets.height,
    wetness: droplets.wetness,
    residue: droplets.residue,
    processHeight: process.height,
    processRoughness: process.roughness,
    processHeat: process.heat,
    processDeposit: process.deposit,
    primaryDirection: fibers.primaryDirection,
    secondaryDirection: fibers.secondaryDirection,
    primaryAnisotropy: fibers.primaryStrength,
    secondaryAnisotropy: fibers.secondaryStrength,
  };
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
  definition: FifthBatchMaterialDefinition,
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
  const broad = fbm2(noise, u * scale, v * scale, { octaves: 5 }) * 0.5 + 0.5;
  const fine = detailNoise.noise2(u * scale * detail, v * scale * detail) * 0.5 + 0.5;
  const processHeight = maps.processHeight.data[pixel]!;
  const processRoughness = maps.processRoughness.data[pixel]!;

  switch (definition.kind) {
    case "carbonFiber": {
      const frequency = scale * 2;
      const cellX = Math.floor(u * frequency);
      const cellY = Math.floor(v * frequency);
      const warp = Math.pow(Math.sin(fract(u * frequency) * Math.PI), 0.7);
      const weft = Math.pow(Math.sin(fract(v * frequency) * Math.PI), 0.7);
      const crossing = (cellX + cellY * 2) % 3 === 0 ? 0 : 1;
      const fiber = crossing ? warp * 0.72 + weft * 0.28 : weft * 0.72 + warp * 0.28;
      sample.baseColor = mixColor(shade(color, 0.48 + fine * 0.12), accentColor, fiber * 0.12);
      sample.height = 0.46 + fiber * 0.055 * amount + fine * 0.008;
      sample.metallic = 0.12;
      sample.roughness = clamp(roughness + (1 - fiber) * 0.18, 0.04, 1);
      sample.anisotropy = crossing ? maps.primaryAnisotropy.data[pixel]! : maps.secondaryAnisotropy.data[pixel]!;
      sample.anisotropyRotation = directionRotation(crossing ? maps.primaryDirection : maps.secondaryDirection, pixel);
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.045 + fine * 0.035;
      break;
    }
    case "damascusSteel": {
      const flow = Math.sin((u * scale * 1.35 + broad * 2.8 + Math.sin(v * TAU * 2) * 0.4) * TAU) * 0.5 + 0.5;
      const etched = smoothstep(0.4, 0.62, flow);
      sample.baseColor = mixColor(color, accentColor, etched * 0.78);
      sample.height = 0.42 + flow * 0.15 * amount + fine * 0.025;
      sample.metallic = 1;
      sample.roughness = clamp(roughness + etched * 0.16 + processRoughness * 0.08, 0.04, 1);
      sample.anisotropy = 0.62 + flow * 0.3;
      sample.anisotropyRotation = directionRotation(maps.primaryDirection, pixel);
      break;
    }
    case "weldedSteel": {
      const weld = maps.weld.data[pixel]!;
      const heat = clamp01(weld * 0.7 + (1 - smoothstep(0.02, 0.3, Math.abs(v - 0.5))) * amount * 0.55);
      const oxide = temperatureOxideColor(150 + heat * 500);
      sample.baseColor = mixColor(color, oxide, heat * 0.92);
      sample.height = 0.42 + weld * 0.35 * amount + processHeight * 0.08;
      sample.metallic = 1;
      sample.roughness = clamp(roughness + weld * 0.24 + fine * 0.08, 0.04, 1);
      sample.anisotropy = 0.28 + weld * 0.42;
      sample.anisotropyRotation = directionRotation(maps.weldDirection, pixel);
      sample.iridescence = heat * 0.68;
      sample.iridescenceThickness = heat;
      break;
    }
    case "galvanizedSteel": {
      const grain = maps.grainId.data[pixel]!;
      const boundary = maps.grainBoundary.data[pixel]!;
      const orientation = maps.grainOrientation.data[pixel]!;
      const spangle = 0.7 + grain * 0.28 + Math.sin(orientation * TAU) * 0.06;
      sample.baseColor = mixColor(shade(color, spangle), accentColor, boundary * 0.48);
      sample.height = 0.48 + boundary * 0.09 + fine * 0.018;
      sample.metallic = 1;
      sample.roughness = clamp(roughness + boundary * 0.18 + (1 - grain) * 0.06, 0.04, 1);
      sample.anisotropy = 0.2 + grain * 0.42;
      sample.anisotropyRotation = orientation;
      break;
    }
    case "cutGem": {
      const angle = Math.atan2(v - 0.5, u - 0.5);
      const radius = Math.hypot(u - 0.5, v - 0.5);
      const sector = fract(angle / TAU * 12 + 1);
      const facet = Math.abs(sector - 0.5) * 2;
      const crown = 1 - smoothstep(0.12, 0.69, radius);
      const dispersion = spectralIor(definition.physical.ior, 35, 430 + facet * 270);
      const spectrum = diffractionColor(facet * 1.7 + radius, 0.62, dispersion - 1);
      sample.baseColor = mixColor(color, spectrum, amount * 0.14);
      sample.height = clamp01(0.3 + crown * 0.38 + facet * 0.035);
      sample.roughness = clamp(roughness + (1 - crown) * 0.08, 0.04, 1);
      sample.transmission = 0.98;
      sample.thickness = clamp01(crown * 0.9 + 0.1);
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.025;
      sample.iridescence = amount * 0.1;
      sample.iridescenceThickness = facet;
      break;
    }
    case "holographicFilm": {
      const grooves = fract((u * Math.cos(0.35) + v * Math.sin(0.35)) * scale * detail + broad * 0.18);
      const spectrum = diffractionColor(grooves + v * 0.3, 0.55 + broad * 0.35, 0.92);
      sample.baseColor = mixColor(color, spectrum, amount);
      sample.height = 0.48 + Math.sin(grooves * TAU) * 0.025;
      sample.metallic = 0.72;
      sample.roughness = clamp(roughness + fine * 0.035, 0.04, 1);
      sample.anisotropy = 0.9;
      sample.anisotropyRotation = fract(0.35 / TAU);
      sample.clearcoat = 0.86;
      sample.clearcoatRoughness = 0.04;
      sample.iridescence = 1;
      sample.iridescenceThickness = grooves;
      break;
    }
    case "laminatedWood": {
      const layers = Math.sin((v * scale * 1.5 + broad * 0.5) * TAU) * 0.5 + 0.5;
      const glue = 1 - smoothstep(0.04, 0.11, Math.abs(layers - 0.5));
      const grain = Math.sin((u * scale * detail + broad * 2) * TAU) * 0.5 + 0.5;
      sample.baseColor = mixColor(mixColor(color, accentColor, layers * 0.62), [0.24, 0.12, 0.04], glue * 0.55);
      sample.height = 0.35 + layers * 0.18 + grain * 0.04 - glue * 0.035;
      sample.roughness = clamp(roughness + glue * 0.12 + fine * 0.08, 0.04, 1);
      sample.ao = 1 - glue * 0.18;
      sample.anisotropy = 0.45 + grain * 0.35;
      sample.anisotropyRotation = 0;
      break;
    }
    case "powderCoat": {
      const deposit = maps.processDeposit.data[pixel]!;
      const orangePeel = Math.pow(fine, 2.5);
      sample.baseColor = mixColor(color, accentColor, deposit * 0.16 + fine * 0.05);
      sample.height = processHeight;
      sample.metallic = 0.05;
      sample.roughness = clamp(roughness + orangePeel * 0.2, 0.04, 1);
      sample.clearcoat = 0.52;
      sample.clearcoatRoughness = 0.18 + orangePeel * 0.1;
      break;
    }
    case "contamination": {
      const droplet = maps.droplets.data[pixel]!;
      const wet = maps.wetness.data[pixel]!;
      const residue = maps.residue.data[pixel]!;
      const fingerprint = Math.pow(Math.sin((Math.hypot(u - 0.35, v - 0.52) * scale * 5 + broad * 0.12) * TAU) * 0.5 + 0.5, 12)
        * (1 - smoothstep(0.15, 0.52, Math.hypot(u - 0.35, v - 0.52)));
      const contamination = clamp01(wet + residue * 0.8 + fingerprint * amount);
      sample.baseColor = mixColor(color, accentColor, contamination * 0.42);
      sample.height = 0.42 + droplet * 0.25 + residue * 0.045 + fingerprint * 0.018;
      sample.roughness = clamp(roughness * (1 - wet * 0.72) + residue * 0.35, 0.04, 1);
      sample.opacity = 0.82 + wet * 0.18;
      sample.transmission = wet * 0.18;
      sample.clearcoat = wet;
      sample.clearcoatRoughness = 0.04 + residue * 0.3;
      break;
    }
    case "firedClay": {
      const pore = 1 - maps.processDeposit.data[pixel]!;
      const heat = maps.processHeat.data[pixel]!;
      const glaze = maps.weld.data[pixel]! * amount;
      const fired = temperatureOxideColor(260 + heat * 390);
      sample.baseColor = mixColor(mixColor(color, fired, heat * 0.38), accentColor, glaze * 0.62);
      sample.height = processHeight + glaze * 0.15 - pore * 0.08;
      sample.roughness = clamp(processRoughness * (1 - glaze * 0.72) + roughness * 0.25, 0.04, 1);
      sample.ao = 1 - pore * 0.32;
      sample.clearcoat = glaze;
      sample.clearcoatRoughness = 0.06 + (1 - glaze) * 0.2;
      sample.iridescence = glaze * 0.22;
      sample.iridescenceThickness = clamp01(glaze * 0.8 + heat * 0.2);
      break;
    }
  }
  return sample;
}

export function buildFifthBatchMaterial(
  definition: FifthBatchMaterialDefinition,
  size: number,
  params: FifthBatchMaterialParams = {},
): LayeredMaterial {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const amount = clamp01(params.amount ?? definition.amount);
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughnessValue = params.roughness ?? definition.roughness;
  const maps = prepareMaps(definition, size, seed, scale, amount);
  const noise = makeNoise(seed);
  const detailNoise = makeNoise(seed + 101);
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

  const extended = assembleExtendedMaterial(
    {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(height, definition.normalStrength),
      ao,
      height,
      emission,
    },
    {
      opacity,
      transmission,
      anisotropy,
      anisotropyRotation,
      physical: definition.physical,
    },
    definition.normalStrength,
  );
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

export const FIFTH_BATCH_MATERIAL_DEFINITIONS = {
  clearcoatCarbonFiber: { label: "清漆碳纤维", focus: "双层纤维各向异性、斜纹编织与清漆", kind: "carbonFiber", process: "coating", seed: 501, scale: 7, detail: 6, amount: 0.9, color: [0.025, 0.028, 0.032], accentColor: [0.22, 0.25, 0.28], roughness: 0.2, normalStrength: 2.2, physical: { ...physicalBase, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.05 } },
  etchedDamascusSteel: { label: "腐蚀大马士革钢", focus: "流线方向场、层叠锻造与腐蚀显纹", kind: "damascusSteel", process: "forging", seed: 502, scale: 6, detail: 5, amount: 0.86, color: [0.48, 0.5, 0.52], accentColor: [0.1, 0.12, 0.14], roughness: 0.24, normalStrength: 5, physical: physicalBase },
  weldedHeatTintSteel: { label: "焊接热变色钢板", focus: "焊珠沉积、热影响区与氧化彩", kind: "weldedSteel", process: "cutting", seed: 503, scale: 8, detail: 5, amount: 0.88, color: [0.38, 0.4, 0.43], accentColor: [0.12, 0.19, 0.42], roughness: 0.3, normalStrength: 7, physical: { ...physicalBase, iridescence: 0.7, iridescenceIor: 1.45 } },
  galvanizedSpangleSteel: { label: "镀锌晶花钢", focus: "晶粒生长、晶界与随机晶向反射", kind: "galvanizedSteel", process: "coating", seed: 504, scale: 7, detail: 5, amount: 0.82, color: [0.58, 0.62, 0.64], accentColor: [0.32, 0.36, 0.39], roughness: 0.31, normalStrength: 4, physical: physicalBase },
  dispersiveCutGem: { label: "色散切割宝石", focus: "切面、折射、色散与体吸收近似", kind: "cutGem", process: "cutting", seed: 505, scale: 9, detail: 5, amount: 0.86, color: [0.22, 0.52, 0.72], accentColor: [0.85, 0.24, 0.56], roughness: 0.06, normalStrength: 4, physical: { ...physicalBase, ior: 2.4, thickness: 1, clearcoat: 1, clearcoatRoughness: 0.025, iridescence: 0.1, attenuationDistance: 0.8, attenuationColor: [0.2, 0.58, 0.78], dispersion: 0.75 } },
  holographicDiffractionFilm: { label: "全息衍射膜", focus: "衍射光栅、方向频谱与视角色变", kind: "holographicFilm", process: "cutting", seed: 506, scale: 12, detail: 7, amount: 0.96, color: [0.28, 0.32, 0.38], accentColor: [0.9, 0.2, 0.75], roughness: 0.1, normalStrength: 3, physical: { ...physicalBase, ior: 1.52, clearcoat: 0.9, clearcoatRoughness: 0.04, iridescence: 1, iridescenceIor: 1.58 } },
  laminatedPlywood: { label: "胶合板层压木", focus: "层材截面、胶层与切削方向", kind: "laminatedWood", process: "cutting", seed: 507, scale: 8, detail: 6, amount: 0.78, color: [0.62, 0.36, 0.14], accentColor: [0.88, 0.66, 0.35], roughness: 0.62, normalStrength: 6, physical: physicalBase },
  powderCoatedMetal: { label: "粉末喷涂金属", focus: "颗粒沉积、橘皮与边缘堆积", kind: "powderCoat", process: "coating", seed: 508, scale: 10, detail: 7, amount: 0.84, color: [0.08, 0.24, 0.5], accentColor: [0.2, 0.55, 0.78], roughness: 0.38, normalStrength: 7, physical: { ...physicalBase, clearcoat: 0.55, clearcoatRoughness: 0.22 } },
  contaminatedCondensationSurface: { label: "指纹灰尘冷凝层", focus: "接触传播、液滴合并、蒸发与湿痕", kind: "contamination", process: "coating", seed: 509, scale: 8, detail: 6, amount: 0.8, color: [0.16, 0.19, 0.22], accentColor: [0.55, 0.58, 0.56], roughness: 0.48, normalStrength: 9, physical: { ...physicalBase, ior: 1.4, thickness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.08 } },
  kilnFiredClay: { label: "窑烧陶土", focus: "温度梯度、烧结孔隙、烟熏与釉料流挂", kind: "firedClay", process: "sintering", seed: 510, scale: 7, detail: 6, amount: 0.82, color: [0.52, 0.18, 0.07], accentColor: [0.12, 0.22, 0.18], roughness: 0.7, normalStrength: 8, physical: { ...physicalBase, ior: 1.5, clearcoat: 0.75, clearcoatRoughness: 0.12, iridescence: 0.2 } },
} satisfies Record<string, FifthBatchMaterialDefinition>;

export type FifthBatchMaterialName = keyof typeof FIFTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: FifthBatchMaterialName) {
  return (size: number, params: FifthBatchMaterialParams = {}) => (
    buildFifthBatchMaterial(FIFTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const FIFTH_BATCH_MATERIALS = {
  clearcoatCarbonFiber: builder("clearcoatCarbonFiber"),
  etchedDamascusSteel: builder("etchedDamascusSteel"),
  weldedHeatTintSteel: builder("weldedHeatTintSteel"),
  galvanizedSpangleSteel: builder("galvanizedSpangleSteel"),
  dispersiveCutGem: builder("dispersiveCutGem"),
  holographicDiffractionFilm: builder("holographicDiffractionFilm"),
  laminatedPlywood: builder("laminatedPlywood"),
  powderCoatedMetal: builder("powderCoatedMetal"),
  contaminatedCondensationSurface: builder("contaminatedCondensationSurface"),
  kilnFiredClay: builder("kilnFiredClay"),
};

export const FIFTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(FIFTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "工艺强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies FifthBatchMaterialParamSpec[]]),
) as Record<FifthBatchMaterialName, FifthBatchMaterialParamSpec[]>;

export function defaultFifthBatchMaterialParams(name: FifthBatchMaterialName): FifthBatchMaterialParams {
  const params: FifthBatchMaterialParams = {};
  for (const spec of FIFTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}
