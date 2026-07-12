import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial } from "./material-mechanics.js";
import { blendColor } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import { assembleLayeredMaterial, type LayeredMaterial, type LayeredMaterialPhysical } from "./shading-mechanics.js";

type RGB = [number, number, number];

type EighthBatchMaterialKind =
  | "skin"
  | "eye"
  | "hair"
  | "fur"
  | "glass"
  | "liquid"
  | "foam"
  | "bubbleFilm"
  | "paper"
  | "cardboard";

export interface EighthBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
  thickness?: number;
  worldScale?: number;
}

export interface EighthBatchMaterialParamSpec {
  key: keyof EighthBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface EighthBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: EighthBatchMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  thickness: number;
  worldScale: number;
  normalStrength: number;
  physical: LayeredMaterialPhysical;
}

interface MaterialSample {
  baseColor: RGB;
  metallic: number;
  roughness: number;
  height: number;
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

const clamp01 = (value: number): number => clamp(value, 0, 1);
const fract = (value: number): number => value - Math.floor(value);

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

function defaultSample(color: RGB, roughness: number, thickness: number): MaterialSample {
  return {
    baseColor: color,
    metallic: 0,
    roughness,
    height: 0.5,
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
    thickness,
    subsurface: 0,
    iridescence: 0,
    iridescenceThickness: 0.5,
  };
}

function sampleMaterial(
  definition: EighthBatchMaterialDefinition,
  noise: Noise,
  detailNoise: Noise,
  u: number,
  v: number,
  scale: number,
  detail: number,
  amount: number,
  color: RGB,
  accentColor: RGB,
  roughness: number,
  thickness: number,
  worldScale: number,
): MaterialSample {
  const frequency = scale * worldScale;
  const macro = fbm2(noise, u * frequency, v * frequency, { octaves: Math.max(1, Math.round(detail)) }) * 0.5 + 0.5;
  const micro = fbm2(detailNoise, u * frequency * 5.3, v * frequency * 5.3, { octaves: 3 }) * 0.5 + 0.5;
  const sample = defaultSample(color, roughness, thickness);

  switch (definition.kind) {
    case "skin": {
      const pores = Math.pow(clamp01(micro), 8) * amount;
      const veins = smoothstep(0.12, 0.01, Math.abs(Math.sin((u * 0.72 + v) * frequency * 1.7 + macro * 2.4))) * amount;
      const flush = clamp01(macro * 0.75 + veins * 0.35);
      sample.baseColor = mixColor(shade(color, 0.86 + macro * 0.24), accentColor, flush * 0.38);
      sample.height = 0.5 - pores * 0.035 + micro * 0.012;
      sample.roughness = clamp(roughness + pores * 0.18 - flush * 0.08, 0.04, 1);
      sample.clearcoat = clamp01(0.16 + flush * 0.18);
      sample.clearcoatRoughness = 0.32 + pores * 0.28;
      sample.sheen = 0.22;
      sample.sheenColor = mixColor(color, [1, 0.62, 0.52], 0.35);
      sample.thickness = clamp01(thickness * (0.55 + macro * 0.45));
      sample.subsurface = clamp01(0.68 + veins * 0.24);
      sample.transmission = sample.subsurface * sample.thickness * 0.16;
      break;
    }
    case "eye": {
      const longitude = (u - 0.25) * TAU;
      const latitude = (v - 0.5) * Math.PI;
      const eyeRadius = Math.acos(clamp(Math.cos(latitude) * Math.cos(longitude), -1, 1)) * 0.5;
      const eyeAngle = Math.atan2(Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
      const iris = smoothstep(0.25, 0.2, eyeRadius) * smoothstep(0.055, 0.09, eyeRadius);
      const pupil = 1 - smoothstep(0.052, 0.075, eyeRadius);
      const limbus = smoothstep(0.19, 0.22, eyeRadius) * smoothstep(0.26, 0.22, eyeRadius);
      const rays = Math.pow(Math.abs(Math.sin(eyeAngle * (28 + detail * 3) + macro * 3)), 2) * iris;
      const scleraVein = smoothstep(0.08, 0.015, Math.abs(Math.sin(eyeAngle * 7 + macro * 3))) * smoothstep(0.18, 0.42, eyeRadius);
      const sclera = mixColor([0.84, 0.81, 0.76], [0.56, 0.08, 0.055], scleraVein * 0.35);
      const irisColor = mixColor(mixColor(color, accentColor, rays * amount), [0.025, 0.018, 0.012], limbus * 0.72);
      sample.baseColor = mixColor(mixColor(sclera, irisColor, iris), [0.005, 0.004, 0.003], pupil);
      sample.height = 0.5 + iris * 0.018 - pupil * 0.01 + limbus * 0.012;
      sample.roughness = clamp(roughness + micro * 0.025, 0.04, 0.3);
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.025;
      sample.transmission = clamp01(0.42 + iris * 0.28);
      sample.thickness = clamp01(thickness * (0.55 + smoothstep(0.5, 0, eyeRadius) * 0.45));
      sample.subsurface = eyeRadius > 0.5 ? 0.24 : 0.08;
      sample.iridescence = iris * 0.12;
      sample.iridescenceThickness = clamp01(0.36 + rays * 0.18);
      break;
    }
    case "hair": {
      const strand = Math.pow(0.5 + 0.5 * Math.sin(u * frequency * TAU * 4 + macro * 2.2), 5);
      const medulla = Math.pow(0.5 + 0.5 * Math.sin(u * frequency * TAU * 8 + micro), 10);
      sample.baseColor = mixColor(shade(color, 0.64 + macro * 0.55), accentColor, strand * 0.32 * amount);
      sample.height = 0.44 + strand * 0.1 + medulla * 0.025;
      sample.roughness = clamp(roughness - strand * 0.12 + micro * 0.05, 0.04, 1);
      sample.anisotropy = 0.94;
      sample.anisotropyRotation = clamp01(0.25 + (macro - 0.5) * 0.035);
      sample.sheen = 0.72;
      sample.sheenColor = shade(accentColor, 1.45);
      sample.transmission = 0.08 + amount * 0.08;
      sample.thickness = clamp01(thickness * 0.3);
      sample.subsurface = 0.12;
      break;
    }
    case "fur": {
      const tuftA = Math.pow(0.5 + 0.5 * Math.sin((u + v * 0.3) * frequency * TAU * 2.5 + macro * 3), 7);
      const tuftB = Math.pow(0.5 + 0.5 * Math.sin((u - v * 0.25) * frequency * TAU * 3.1 - macro * 2), 7);
      const tuft = Math.max(tuftA, tuftB) * amount;
      sample.baseColor = mixColor(shade(color, 0.65 + macro * 0.5), accentColor, tuft * 0.35);
      sample.height = 0.4 + tuft * 0.18 + micro * 0.025;
      sample.roughness = clamp(roughness + (1 - tuft) * 0.12, 0.04, 1);
      sample.anisotropy = 0.68 + tuft * 0.2;
      sample.anisotropyRotation = clamp01(0.25 + Math.sin(v * frequency * TAU) * 0.04);
      sample.sheen = 0.92;
      sample.sheenColor = shade(accentColor, 1.35);
      sample.opacity = clamp01(0.82 + tuft * 0.18);
      sample.subsurface = 0.18;
      break;
    }
    case "glass": {
      const bubble = 1 - smoothstep(0.018, 0.045, Math.abs(fract(macro * 9 + micro * 2) - 0.5));
      const striation = 0.5 + 0.5 * Math.sin((u + macro * 0.06) * frequency * TAU * 1.6);
      sample.baseColor = mixColor(color, accentColor, striation * amount * 0.24);
      sample.height = 0.5 + striation * 0.012 + bubble * 0.01;
      sample.roughness = clamp(roughness + bubble * 0.08, 0.04, 0.45);
      sample.opacity = 0.28 + bubble * 0.18;
      sample.transmission = clamp01(0.96 - bubble * 0.22);
      sample.thickness = clamp01(thickness * (0.72 + striation * 0.28));
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.035 + bubble * 0.05;
      sample.iridescence = 0.08 * amount;
      sample.iridescenceThickness = 0.45 + striation * 0.12;
      break;
    }
    case "liquid": {
      const waveA = Math.sin((u * 1.2 + v * 0.7) * frequency * TAU + macro * 2);
      const waveB = Math.sin((u * -0.6 + v * 1.4) * frequency * TAU * 1.7 - micro);
      const wave = (waveA + waveB) * 0.25 + 0.5;
      const bubble = smoothstep(0.46, 0.5, fract(macro * 13 + micro * 5));
      sample.baseColor = mixColor(color, accentColor, wave * amount * 0.35);
      sample.height = 0.44 + wave * 0.12 + bubble * 0.015;
      sample.roughness = clamp(roughness + bubble * 0.14, 0.04, 0.5);
      sample.opacity = 0.42;
      sample.transmission = clamp01(0.9 - bubble * 0.2);
      sample.thickness = clamp01(thickness * (0.72 + macro * 0.28));
      sample.clearcoat = 0.92;
      sample.clearcoatRoughness = 0.045;
      sample.subsurface = 0.08;
      break;
    }
    case "foam": {
      const cells = Math.abs(Math.sin(u * frequency * TAU * 1.7 + macro * 3) * Math.sin(v * frequency * TAU * 1.9 - micro * 2));
      const walls = smoothstep(0.12, 0.42, cells);
      const cavity = 1 - walls;
      sample.baseColor = mixColor(shade(color, 0.8 + walls * 0.35), accentColor, cavity * amount * 0.32);
      sample.height = 0.38 + walls * 0.2 + micro * 0.018;
      sample.roughness = clamp(roughness + cavity * 0.18, 0.04, 1);
      sample.ao = clamp01(1 - cavity * 0.46);
      sample.opacity = 0.9 + walls * 0.1;
      sample.transmission = cavity * 0.12;
      sample.thickness = clamp01(thickness * (0.4 + walls * 0.6));
      sample.subsurface = 0.62 + walls * 0.25;
      sample.sheen = 0.3;
      sample.sheenColor = shade(color, 1.18);
      break;
    }
    case "bubbleFilm": {
      const cellX = fract(u * frequency + macro * 0.18) - 0.5;
      const cellY = fract(v * frequency + micro * 0.18) - 0.5;
      const cellRadius = Math.hypot(cellX, cellY);
      const ring = 1 - smoothstep(0.035, 0.09, Math.abs(cellRadius - 0.36));
      const film = clamp01(1 - cellRadius * 1.6);
      sample.baseColor = mixColor(color, accentColor, film * 0.18);
      sample.height = 0.46 + ring * 0.08 + film * 0.025;
      sample.roughness = clamp(roughness + (1 - film) * 0.08, 0.04, 0.35);
      sample.opacity = clamp01(0.18 + ring * 0.32);
      sample.transmission = clamp01(0.98 - ring * 0.12);
      sample.thickness = clamp01(thickness * (0.16 + ring * 0.34));
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.02;
      sample.iridescence = clamp01(0.72 + film * 0.28) * amount;
      sample.iridescenceThickness = fract(film * 0.62 + macro * 0.32);
      break;
    }
    case "paper": {
      const longFiber = Math.pow(0.5 + 0.5 * Math.sin((u + macro * 0.04) * frequency * TAU * 5), 12);
      const crossFiber = Math.pow(0.5 + 0.5 * Math.sin((v + micro * 0.02) * frequency * TAU * 7), 16);
      const fiber = clamp01(longFiber + crossFiber * 0.55) * amount;
      const speck = Math.pow(micro, 7);
      sample.baseColor = mixColor(shade(color, 0.86 + macro * 0.22), accentColor, fiber * 0.24 + speck * 0.18);
      sample.height = 0.46 + fiber * 0.075 + micro * 0.018;
      sample.roughness = clamp(roughness + fiber * 0.1, 0.04, 1);
      sample.ao = 1 - speck * 0.08;
      sample.anisotropy = 0.18 + fiber * 0.28;
      sample.anisotropyRotation = 0;
      sample.thickness = clamp01(thickness * (0.78 + macro * 0.22));
      sample.subsurface = 0.32 + fiber * 0.18;
      sample.transmission = sample.thickness * 0.06;
      sample.sheen = 0.08;
      break;
    }
    case "cardboard": {
      const corrugation = 0.5 + 0.5 * Math.sin(u * frequency * TAU * 1.8);
      const linerFiber = Math.pow(0.5 + 0.5 * Math.sin((v + macro * 0.04) * frequency * TAU * 6), 10);
      const glue = smoothstep(0.84, 0.98, corrugation) * amount;
      sample.baseColor = mixColor(shade(color, 0.72 + macro * 0.42), accentColor, linerFiber * 0.22 + glue * 0.18);
      sample.height = 0.36 + corrugation * 0.22 + linerFiber * 0.035;
      sample.roughness = clamp(roughness + linerFiber * 0.1 - glue * 0.12, 0.04, 1);
      sample.ao = clamp01(0.78 + corrugation * 0.22);
      sample.anisotropy = 0.32;
      sample.anisotropyRotation = 0.25;
      sample.thickness = clamp01(thickness * (0.72 + corrugation * 0.28));
      sample.subsurface = 0.16;
      sample.sheen = glue * 0.12;
      break;
    }
  }
  return sample;
}

export function buildEighthBatchMaterial(
  definition: EighthBatchMaterialDefinition,
  size: number,
  params: EighthBatchMaterialParams = {},
): LayeredMaterial {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const seed = params.seed ?? definition.seed;
  const scale = Math.max(0.1, params.scale ?? definition.scale);
  const detail = Math.max(1, params.detail ?? definition.detail);
  const amount = clamp01(params.amount ?? definition.amount);
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughnessValue = clamp(params.roughness ?? definition.roughness, 0.04, 1);
  const thicknessValue = clamp01(params.thickness ?? definition.thickness);
  const worldScale = Math.max(0.1, params.worldScale ?? definition.worldScale);
  const noise = makeNoise(seed);
  const detailNoise = makeNoise(seed + 181);
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
        definition, noise, detailNoise, u, v, scale, detail, amount,
        color, accentColor, roughnessValue, thicknessValue, worldScale,
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

export const EIGHTH_BATCH_MATERIAL_DEFINITIONS = {
  layeredHumanSkin: { label: "分层人体皮肤", focus: "毛孔、油脂、血色、厚度与次表面散射", kind: "skin", seed: 801, scale: 7, detail: 6, amount: 0.72, color: [0.66, 0.31, 0.23], accentColor: [0.78, 0.18, 0.14], roughness: 0.48, thickness: 0.68, worldScale: 1, normalStrength: 4, physical: { ...physicalBase, ior: 1.4, thickness: 0.65, clearcoat: 0.28, clearcoatRoughness: 0.35, sheen: 0.2, subsurface: 0.78, attenuationDistance: 0.18, attenuationColor: [1, 0.28, 0.2] } },
  anatomicalWetEye: { label: "分层湿润眼球", focus: "巩膜、虹膜、瞳孔、角膜与泪膜", kind: "eye", seed: 802, scale: 6, detail: 7, amount: 0.82, color: [0.08, 0.32, 0.38], accentColor: [0.55, 0.34, 0.08], roughness: 0.055, thickness: 0.78, worldScale: 1, normalStrength: 2, physical: { ...physicalBase, ior: 1.376, thickness: 0.72, clearcoat: 1, clearcoatRoughness: 0.025, iridescence: 0.12, attenuationDistance: 0.7, attenuationColor: [0.74, 0.92, 1] } },
  dualLobeHumanHair: { label: "双高光人体发丝", focus: "纵向纤维、髓质、Marschner 双峰近似", kind: "hair", seed: 803, scale: 12, detail: 7, amount: 0.82, color: [0.055, 0.025, 0.012], accentColor: [0.42, 0.16, 0.045], roughness: 0.28, thickness: 0.12, worldScale: 1, normalStrength: 7, physical: { ...physicalBase, ior: 1.55, thickness: 0.08, sheen: 0.72, sheenRoughness: 0.22, attenuationDistance: 0.08, attenuationColor: [0.18, 0.06, 0.02] } },
  directionalDenseFur: { label: "定向致密毛皮", focus: "毛束、底绒、方向场与掠射高光", kind: "fur", seed: 804, scale: 9, detail: 7, amount: 0.86, color: [0.18, 0.09, 0.035], accentColor: [0.62, 0.36, 0.12], roughness: 0.58, thickness: 0.18, worldScale: 1, normalStrength: 9, physical: { ...physicalBase, ior: 1.52, sheen: 0.92, sheenRoughness: 0.48, subsurface: 0.16, attenuationColor: [0.52, 0.24, 0.08] } },
  solidOpticalGlass: { label: "实体光学玻璃", focus: "体吸收、折射、色散、气泡与流纹", kind: "glass", seed: 805, scale: 5, detail: 6, amount: 0.56, color: [0.65, 0.88, 0.93], accentColor: [0.22, 0.58, 0.72], roughness: 0.06, thickness: 0.9, worldScale: 1, normalStrength: 2, physical: { ...physicalBase, ior: 1.52, thickness: 0.9, clearcoat: 1, clearcoatRoughness: 0.035, iridescence: 0.08, attenuationDistance: 1.8, attenuationColor: [0.55, 0.88, 0.94], dispersion: 0.035 } },
  tintedFlowingLiquid: { label: "有色流动液体", focus: "波面、体吸收、液中气泡与薄层高光", kind: "liquid", seed: 806, scale: 4, detail: 6, amount: 0.7, color: [0.1, 0.48, 0.62], accentColor: [0.08, 0.82, 0.68], roughness: 0.08, thickness: 0.82, worldScale: 1, normalStrength: 5, physical: { ...physicalBase, ior: 1.333, thickness: 0.8, clearcoat: 0.92, clearcoatRoughness: 0.045, subsurface: 0.08, attenuationDistance: 0.9, attenuationColor: [0.12, 0.62, 0.72], dispersion: 0.01 } },
  multiscaleCellularFoam: { label: "多尺度胞状泡沫", focus: "泡孔、液膜、遮蔽与消泡层级", kind: "foam", seed: 807, scale: 8, detail: 6, amount: 0.84, color: [0.9, 0.92, 0.88], accentColor: [0.62, 0.72, 0.78], roughness: 0.62, thickness: 0.56, worldScale: 1, normalStrength: 10, physical: { ...physicalBase, ior: 1.34, thickness: 0.5, sheen: 0.3, sheenRoughness: 0.65, subsurface: 0.72, attenuationDistance: 0.3, attenuationColor: [0.84, 0.92, 1] } },
  iridescentSoapBubbles: { label: "虹彩肥皂气泡膜", focus: "球膜边缘、薄膜干涉、透明与液膜厚度", kind: "bubbleFilm", seed: 808, scale: 7, detail: 5, amount: 0.92, color: [0.72, 0.86, 0.92], accentColor: [0.92, 0.42, 0.72], roughness: 0.04, thickness: 0.22, worldScale: 1, normalStrength: 3, physical: { ...physicalBase, ior: 1.34, thickness: 0.18, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIor: 1.33, attenuationDistance: 2.5, attenuationColor: [0.8, 0.92, 1] } },
  fibrousAbsorbentPaper: { label: "纤维吸墨纸张", focus: "长短纤维、纸浆颗粒、吸墨与透光", kind: "paper", seed: 809, scale: 9, detail: 7, amount: 0.78, color: [0.82, 0.78, 0.66], accentColor: [0.45, 0.34, 0.2], roughness: 0.78, thickness: 0.42, worldScale: 1, normalStrength: 7, physical: { ...physicalBase, ior: 1.47, thickness: 0.35, sheen: 0.08, subsurface: 0.38, attenuationDistance: 0.24, attenuationColor: [0.86, 0.72, 0.5] } },
  layeredCorrugatedCardboard: { label: "分层瓦楞纸板", focus: "面纸、瓦楞芯、胶线、截面方向", kind: "cardboard", seed: 810, scale: 7, detail: 7, amount: 0.8, color: [0.48, 0.3, 0.14], accentColor: [0.72, 0.5, 0.24], roughness: 0.82, thickness: 0.74, worldScale: 1, normalStrength: 11, physical: { ...physicalBase, ior: 1.46, thickness: 0.7, sheen: 0.12, subsurface: 0.16, attenuationDistance: 0.2, attenuationColor: [0.58, 0.34, 0.14] } },
} satisfies Record<string, EighthBatchMaterialDefinition>;

export type EighthBatchMaterialName = keyof typeof EIGHTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: EighthBatchMaterialName) {
  return (size: number, params: EighthBatchMaterialParams = {}): LayeredMaterial => (
    buildEighthBatchMaterial(EIGHTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const EIGHTH_BATCH_MATERIALS = {
  layeredHumanSkin: builder("layeredHumanSkin"),
  anatomicalWetEye: builder("anatomicalWetEye"),
  dualLobeHumanHair: builder("dualLobeHumanHair"),
  directionalDenseFur: builder("directionalDenseFur"),
  solidOpticalGlass: builder("solidOpticalGlass"),
  tintedFlowingLiquid: builder("tintedFlowingLiquid"),
  multiscaleCellularFoam: builder("multiscaleCellularFoam"),
  iridescentSoapBubbles: builder("iridescentSoapBubbles"),
  fibrousAbsorbentPaper: builder("fibrousAbsorbentPaper"),
  layeredCorrugatedCardboard: builder("layeredCorrugatedCardboard"),
};

export const EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(EIGHTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "机制强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
    { key: "thickness", label: "厚度", type: "range", min: 0, max: 1, step: 0.01, default: definition.thickness },
    { key: "worldScale", label: "世界尺度", type: "range", min: 0.1, max: 4, step: 0.05, default: definition.worldScale },
  ] satisfies EighthBatchMaterialParamSpec[]]),
) as Record<EighthBatchMaterialName, EighthBatchMaterialParamSpec[]>;

export function defaultEighthBatchMaterialParams(name: EighthBatchMaterialName): EighthBatchMaterialParams {
  const params: EighthBatchMaterialParams = {};
  for (const spec of EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}
