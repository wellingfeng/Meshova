import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial } from "./material-mechanics.js";
import { blendColor } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import { exportRealtimeMaterialBundle } from "./realtime-material-system.js";
import { assembleLayeredMaterial, type LayeredMaterial, type LayeredMaterialPhysical } from "./shading-mechanics.js";
import {
  VOLUME_RAYMARCH_WGSL,
  analyzeVolumeReference,
  createProceduralVolume,
  evolveVolume,
  planMicroDisplacement,
  sampleOceanSpectrum,
  serializeVolumeField,
  type GerstnerWave,
  type MicroDisplacementPlan,
  type ProceduralVolumeOptions,
  type VolumeField,
  type VolumeReferenceReport,
} from "./volume-material-system.js";

type RGB = [number, number, number];

type NinthBatchMaterialKind =
  | "cloud"
  | "fireSmoke"
  | "ocean"
  | "snowIce"
  | "strata"
  | "wetMud"
  | "moltenGlass"
  | "barkMoss"
  | "wovenYarn"
  | "feather";

export interface NinthBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
  displacement?: number;
  time?: number;
}

export interface NinthBatchMaterialParamSpec {
  key: keyof NinthBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface NinthBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: NinthBatchMaterialKind;
  runtimeMode: "surface" | "volume" | "hybrid";
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  displacement: number;
  time: number;
  normalStrength: number;
  volume: ProceduralVolumeOptions;
  physical: LayeredMaterialPhysical;
}

export interface NinthBatchRuntime {
  readonly mode: NinthBatchMaterialDefinition["runtimeMode"];
  readonly volume: VolumeField;
  readonly volumeReference: VolumeReferenceReport;
  readonly displacement: MicroDisplacementPlan;
  readonly volumeWgsl: string;
  readonly waves: readonly GerstnerWave[];
}

export interface NinthBatchMaterial extends LayeredMaterial {
  readonly ninthBatchRuntime: NinthBatchRuntime;
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

function defaultSample(color: RGB, roughness: number): MaterialSample {
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
    thickness: 0,
    subsurface: 0,
    iridescence: 0,
    iridescenceThickness: 0.5,
  };
}

const DEFAULT_WAVES: readonly GerstnerWave[] = [
  { direction: [1, 0.2], amplitude: 0.16, wavelength: 1.8, speed: 1.2, steepness: 0.78 },
  { direction: [0.35, 1], amplitude: 0.09, wavelength: 0.78, speed: 1.7, steepness: 0.68 },
  { direction: [-0.7, 0.4], amplitude: 0.045, wavelength: 0.31, speed: 2.4, steepness: 0.52 },
];

function sampleMaterial(
  definition: NinthBatchMaterialDefinition,
  noise: Noise,
  detailNoise: Noise,
  u: number,
  v: number,
  params: Required<NinthBatchMaterialParams>,
): MaterialSample {
  const frequency = params.scale;
  const macro = fbm2(noise, u * frequency, v * frequency, { octaves: Math.max(1, Math.round(params.detail)) }) * 0.5 + 0.5;
  const micro = fbm2(detailNoise, u * frequency * 4.3, v * frequency * 4.3, { octaves: 3 }) * 0.5 + 0.5;
  const sample = defaultSample(params.color, params.roughness);

  switch (definition.kind) {
    case "cloud": {
      const billow = smoothstep(0.34, 0.72, macro * 0.72 + micro * 0.28);
      const silver = smoothstep(0.56, 0.88, micro) * billow;
      sample.baseColor = mixColor(shade(params.color, 0.72 + billow * 0.34), params.accentColor, silver * params.amount);
      sample.height = 0.36 + billow * params.displacement * 0.22;
      sample.roughness = clamp(params.roughness + (1 - billow) * 0.14, 0.04, 1);
      sample.opacity = clamp01(0.12 + billow * 0.82);
      sample.transmission = clamp01(0.58 - billow * 0.28);
      sample.thickness = clamp01(billow * 0.84);
      sample.subsurface = clamp01(0.72 + billow * 0.24);
      sample.sheen = 0.18;
      sample.sheenColor = shade(params.color, 1.15);
      break;
    }
    case "fireSmoke": {
      const plume = smoothstep(0.28, 0.72, macro * 0.68 + micro * 0.32);
      const flame = smoothstep(0.48, 0.9, 1 - v + micro * 0.34) * plume * params.amount;
      const ember = Math.pow(micro, 9) * flame;
      sample.baseColor = mixColor(shade(params.color, 0.38 + plume * 0.34), params.accentColor, flame);
      sample.height = 0.42 + plume * params.displacement * 0.12;
      sample.roughness = clamp(params.roughness + plume * 0.12, 0.04, 1);
      sample.opacity = clamp01(0.08 + plume * 0.82);
      sample.emission = shade(mixColor(params.accentColor, [1, 0.08, 0.005], flame), flame * (1.15 + ember));
      sample.transmission = clamp01(0.34 - plume * 0.28);
      sample.thickness = plume;
      sample.subsurface = flame * 0.24;
      break;
    }
    case "ocean": {
      const warpedU = u + (macro - 0.5) * 0.14 + detailNoise.noise2(u * frequency * 0.7, v * frequency * 0.7) * 0.035;
      const warpedV = v + (micro - 0.5) * 0.08 + noise.noise2(u * frequency * 0.45, v * frequency * 0.45) * 0.025;
      const ocean = sampleOceanSpectrum(warpedU * frequency * 0.42, warpedV * frequency * 0.42, params.time, DEFAULT_WAVES);
      const crestFoam = smoothstep(0.24, 0.62, ocean.foam);
      const foam = clamp01(crestFoam * 0.82 + smoothstep(0.86, 0.98, micro) * 0.18) * params.amount;
      const normalizedHeight = clamp01(0.5 + ocean.height * 1.8);
      sample.baseColor = mixColor(shade(params.color, 0.62 + normalizedHeight * 0.46), params.accentColor, foam);
      sample.height = clamp01(0.5 + ocean.height * params.displacement * 0.48 + foam * 0.035);
      sample.roughness = clamp(params.roughness + foam * 0.52, 0.04, 1);
      sample.opacity = clamp01(0.5 + foam * 0.5);
      sample.transmission = clamp01(0.9 - foam * 0.78);
      sample.clearcoat = clamp01(0.96 - foam * 0.38);
      sample.clearcoatRoughness = 0.035 + foam * 0.28;
      sample.thickness = clamp01(0.68 + normalizedHeight * 0.22);
      sample.subsurface = foam * 0.56;
      break;
    }
    case "snowIce": {
      const compact = smoothstep(0.3, 0.78, macro);
      const crystal = Math.pow(micro, 7);
      const crack = smoothstep(0.09, 0.015, Math.abs(Math.sin((u + macro * 0.08) * frequency * TAU) * Math.sin((v - macro * 0.06) * frequency * TAU)));
      sample.baseColor = mixColor(shade(params.color, 0.82 + compact * 0.24), params.accentColor, crack * 0.58 + crystal * 0.16);
      sample.height = clamp01(0.42 + compact * params.displacement * 0.18 - crack * 0.08);
      sample.roughness = clamp(params.roughness - compact * 0.16 + crystal * 0.08, 0.04, 1);
      sample.transmission = clamp01(compact * 0.38 + crack * 0.22);
      sample.clearcoat = compact * 0.58;
      sample.clearcoatRoughness = 0.09 + (1 - compact) * 0.38;
      sample.thickness = clamp01(0.48 + compact * 0.48);
      sample.subsurface = clamp01(0.62 + compact * 0.3);
      sample.iridescence = crystal * 0.08;
      break;
    }
    case "strata": {
      const fold = Math.sin((v + macro * 0.14 + Math.sin(u * TAU) * 0.06) * frequency * TAU * 0.58) * 0.5 + 0.5;
      const layer = smoothstep(0.18, 0.82, fold);
      const fracture = smoothstep(0.065, 0.012, Math.abs(Math.sin((u * 0.82 + v * 0.27 + macro * 0.11) * frequency * TAU * 0.72)));
      sample.baseColor = mixColor(shade(params.color, 0.68 + macro * 0.42), params.accentColor, layer * params.amount);
      sample.height = clamp01(0.42 + (layer - 0.5) * params.displacement * 0.28 - fracture * 0.13);
      sample.roughness = clamp(params.roughness + fracture * 0.12 - layer * 0.05, 0.04, 1);
      sample.ao = clamp01(1 - fracture * 0.46);
      break;
    }
    case "wetMud": {
      const aggregate = smoothstep(0.5, 0.86, micro);
      const puddle = smoothstep(0.62, 0.36, macro) * params.amount;
      const footprint = smoothstep(0.18, 0.04, Math.abs(Math.hypot((u - 0.52) * 1.4, v - 0.5) - 0.22));
      sample.baseColor = mixColor(shade(params.color, 0.58 + aggregate * 0.3), params.accentColor, puddle * 0.62);
      sample.height = clamp01(0.48 + aggregate * params.displacement * 0.14 - puddle * 0.09 - footprint * 0.055);
      sample.roughness = clamp(params.roughness - puddle * 0.58 + aggregate * 0.08, 0.04, 1);
      sample.ao = clamp01(1 - footprint * 0.12);
      sample.clearcoat = puddle * 0.82;
      sample.clearcoatRoughness = 0.055 + (1 - puddle) * 0.4;
      break;
    }
    case "moltenGlass": {
      const flow = Math.sin((u + macro * 0.16 + params.time * 0.035) * frequency * TAU * 0.55) * 0.5 + 0.5;
      const hot = smoothstep(0.42, 0.86, flow * 0.68 + micro * 0.32) * params.amount;
      sample.baseColor = mixColor(params.color, params.accentColor, hot * 0.72);
      sample.height = clamp01(0.46 + flow * params.displacement * 0.09);
      sample.roughness = clamp(params.roughness + (1 - hot) * 0.12, 0.04, 0.45);
      sample.opacity = clamp01(0.32 + (1 - hot) * 0.18);
      sample.transmission = clamp01(0.92 - hot * 0.24);
      sample.emission = shade(params.accentColor, hot * 0.88);
      sample.clearcoat = 1;
      sample.clearcoatRoughness = 0.025 + (1 - hot) * 0.06;
      sample.thickness = clamp01(0.72 + flow * 0.26);
      sample.iridescence = 0.06;
      sample.iridescenceThickness = 0.36 + flow * 0.22;
      break;
    }
    case "barkMoss": {
      const ridge = Math.pow(0.5 + 0.5 * Math.sin((u + macro * 0.08) * frequency * TAU * 0.62), 4);
      const fissure = smoothstep(0.12, 0.025, Math.abs(Math.sin((u + micro * 0.05) * frequency * TAU)));
      const moss = smoothstep(0.54, 0.82, macro * 0.65 + (1 - v) * 0.35) * params.amount;
      sample.baseColor = mixColor(shade(params.color, 0.58 + ridge * 0.48), params.accentColor, moss);
      sample.height = clamp01(0.36 + ridge * params.displacement * 0.3 - fissure * 0.11 + moss * 0.035);
      sample.roughness = clamp(params.roughness + moss * 0.1, 0.04, 1);
      sample.ao = clamp01(1 - fissure * 0.52);
      sample.sheen = moss * 0.18;
      sample.sheenColor = shade(params.accentColor, 1.1);
      sample.subsurface = moss * 0.15;
      break;
    }
    case "wovenYarn": {
      const warp = Math.pow(0.5 + 0.5 * Math.sin(u * frequency * TAU * 2.4), 5);
      const weft = Math.pow(0.5 + 0.5 * Math.sin(v * frequency * TAU * 2.4), 5);
      const over = Math.sin((u + v) * frequency * Math.PI) > 0 ? warp : weft;
      const fuzz = Math.pow(micro, 8) * params.amount;
      sample.baseColor = mixColor(shade(params.color, 0.68 + over * 0.42), params.accentColor, (1 - over) * 0.28 + fuzz * 0.22);
      sample.height = clamp01(0.4 + over * params.displacement * 0.24 + fuzz * 0.025);
      sample.roughness = clamp(params.roughness + fuzz * 0.15, 0.04, 1);
      sample.ao = clamp01(0.78 + over * 0.22);
      sample.anisotropy = 0.74 + over * 0.2;
      sample.anisotropyRotation = over === warp ? 0 : 0.25;
      sample.sheen = 0.62;
      sample.sheenColor = shade(params.accentColor, 1.18);
      sample.opacity = clamp01(0.9 + over * 0.1);
      break;
    }
    case "feather": {
      const centerDistance = Math.abs(u - 0.5);
      const shaft = smoothstep(0.045, 0.012, centerDistance);
      const edge = smoothstep(0.5, 0.38, centerDistance) * smoothstep(0, 0.16, v) * smoothstep(1, 0.78, v);
      const barbs = Math.pow(0.5 + 0.5 * Math.sin((v + centerDistance * 0.52) * frequency * TAU * 2.8), 7) * edge;
      const breakup = smoothstep(0.78, 0.96, micro) * edge;
      sample.baseColor = mixColor(shade(params.color, 0.7 + barbs * 0.38), params.accentColor, shaft * 0.65 + barbs * 0.18);
      sample.height = clamp01(0.43 + shaft * params.displacement * 0.22 + barbs * 0.04);
      sample.roughness = clamp(params.roughness - shaft * 0.14 + breakup * 0.16, 0.04, 1);
      sample.opacity = clamp01(edge * (1 - breakup * 0.7));
      sample.transmission = edge * 0.2;
      sample.anisotropy = clamp01(0.76 + shaft * 0.2);
      sample.anisotropyRotation = centerDistance < 0.5 ? 0.25 + (u < 0.5 ? -0.04 : 0.04) : 0.25;
      sample.sheen = 0.72;
      sample.sheenColor = shade(params.accentColor, 1.25);
      sample.iridescence = barbs * 0.16 * params.amount;
      sample.iridescenceThickness = fract(barbs * 0.52 + macro * 0.26);
      break;
    }
  }
  return sample;
}

export function buildNinthBatchMaterial(
  definition: NinthBatchMaterialDefinition,
  size: number,
  input: NinthBatchMaterialParams = {},
): NinthBatchMaterial {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const params: Required<NinthBatchMaterialParams> = {
    seed: input.seed ?? definition.seed,
    scale: Math.max(0.1, input.scale ?? definition.scale),
    detail: Math.max(1, input.detail ?? definition.detail),
    amount: clamp01(input.amount ?? definition.amount),
    color: input.color ?? definition.color,
    accentColor: input.accentColor ?? definition.accentColor,
    roughness: clamp(input.roughness ?? definition.roughness, 0.04, 1),
    displacement: clamp01(input.displacement ?? definition.displacement),
    time: Math.max(0, input.time ?? definition.time),
  };
  const noise = makeNoise(params.seed);
  const detailNoise = makeNoise(params.seed + 181);
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
      const sample = sampleMaterial(definition, noise, detailNoise, u, v, params);
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
    normal: heightToNormal(height, definition.normalStrength * Math.max(0.05, params.displacement)),
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
  const layered = assembleLayeredMaterial(extended, {
    clearcoat,
    clearcoatRoughness,
    sheen,
    sheenColor,
    thicknessMap,
    subsurface,
    iridescence,
    iridescenceThickness,
  }, definition.physical);
  const volumeOptions = {
    ...definition.volume,
    width: definition.volume.width ?? 12,
    height: definition.volume.height ?? 12,
    depth: definition.volume.depth ?? 12,
    seed: params.seed,
    scale: params.scale * 0.45,
    detail: Math.min(6, params.detail),
    density: (definition.volume.density ?? 0) * params.amount,
  };
  let volume = createProceduralVolume(volumeOptions);
  if (params.time > 0 && definition.runtimeMode !== "surface") {
    volume = evolveVolume(volume, {
      timeStep: Math.min(1, params.time * 0.08),
      combustion: definition.kind === "fireSmoke" ? 0.72 : 0,
      cooling: definition.kind === "fireSmoke" ? 0.025 : 0.04,
    });
  }
  return {
    ...layered,
    ninthBatchRuntime: {
      mode: definition.runtimeMode,
      volume,
      volumeReference: analyzeVolumeReference(volume),
      displacement: planMicroDisplacement(height, { heightScale: params.displacement * 0.16 }),
      volumeWgsl: VOLUME_RAYMARCH_WGSL,
      waves: definition.kind === "ocean" ? DEFAULT_WAVES : [],
    },
  };
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

const emptyVolume = { density: 0, temperature: 0, humidity: 0, buoyancy: 0, shape: "box" as const };

export const NINTH_BATCH_MATERIAL_DEFINITIONS = {
  evolvingCumulusCloud: { label: "演化积云", focus: "3D 密度、风场、单散射与银边", kind: "cloud", runtimeMode: "volume", seed: 901, scale: 4.2, detail: 5, amount: 0.82, color: [0.82, 0.86, 0.9], accentColor: [1, 0.94, 0.78], roughness: 0.86, displacement: 0.58, time: 2, normalStrength: 4, volume: { density: 0.92, temperature: 0.12, humidity: 0.96, buoyancy: 0.12, shape: "sphere" }, physical: { ...physicalBase, ior: 1.01, thickness: 0.82, subsurface: 0.9, attenuationDistance: 0.72, attenuationColor: [0.8, 0.88, 1] } },
  combustionFireAndSmoke: { label: "燃烧火焰与烟雾", focus: "燃料输运、温度、黑体辐射与烟羽", kind: "fireSmoke", runtimeMode: "volume", seed: 902, scale: 5.4, detail: 5, amount: 0.88, color: [0.08, 0.07, 0.065], accentColor: [1, 0.28, 0.018], roughness: 0.72, displacement: 0.36, time: 3, normalStrength: 3, volume: { density: 0.86, temperature: 0.86, humidity: 0.08, buoyancy: 0.48, wind: { x: 0.04, y: 0.08, z: 0.02 }, shape: "plume" }, physical: { ...physicalBase, ior: 1.01, thickness: 0.7, emissiveIntensity: 3.2, subsurface: 0.2, attenuationDistance: 0.32, attenuationColor: [0.18, 0.16, 0.15] } },
  spectralOceanSeafoam: { label: "波谱海水与浪花", focus: "Gerstner 波谱、泡沫输运、吸收与焦散近似", kind: "ocean", runtimeMode: "hybrid", seed: 903, scale: 5.8, detail: 5, amount: 0.74, color: [0.025, 0.24, 0.34], accentColor: [0.82, 0.92, 0.9], roughness: 0.08, displacement: 0.86, time: 1.8, normalStrength: 8, volume: { density: 0.12, temperature: 0.08, humidity: 1, buoyancy: 0, shape: "layer" }, physical: { ...physicalBase, ior: 1.333, thickness: 0.88, clearcoat: 0.96, clearcoatRoughness: 0.04, subsurface: 0.16, attenuationDistance: 1.3, attenuationColor: [0.04, 0.46, 0.56], dispersion: 0.006 } },
  compactedSnowIceCrust: { label: "压实雪层与冰壳", focus: "晶粒、体散射、压实与融冻裂纹", kind: "snowIce", runtimeMode: "hybrid", seed: 904, scale: 7.2, detail: 6, amount: 0.8, color: [0.82, 0.9, 0.94], accentColor: [0.35, 0.65, 0.82], roughness: 0.42, displacement: 0.68, time: 1, normalStrength: 8, volume: { density: 0.48, temperature: 0.04, humidity: 0.7, buoyancy: 0, shape: "layer" }, physical: { ...physicalBase, ior: 1.31, thickness: 0.72, clearcoat: 0.52, clearcoatRoughness: 0.12, subsurface: 0.82, attenuationDistance: 0.46, attenuationColor: [0.7, 0.88, 1] } },
  foldedErodedRockStrata: { label: "褶皱侵蚀岩层", focus: "地层褶皱、断裂、侵蚀与真实位移", kind: "strata", runtimeMode: "surface", seed: 905, scale: 6.4, detail: 6, amount: 0.72, color: [0.3, 0.22, 0.15], accentColor: [0.62, 0.46, 0.28], roughness: 0.84, displacement: 0.92, time: 0, normalStrength: 14, volume: emptyVolume, physical: { ...physicalBase, ior: 1.48 } },
  deformableWetSandMud: { label: "可变形湿沙泥浆", focus: "颗粒、含水率、足迹与表面积水", kind: "wetMud", runtimeMode: "surface", seed: 906, scale: 8.2, detail: 6, amount: 0.76, color: [0.24, 0.15, 0.075], accentColor: [0.055, 0.04, 0.028], roughness: 0.68, displacement: 0.72, time: 1, normalStrength: 10, volume: emptyVolume, physical: { ...physicalBase, ior: 1.38, clearcoat: 0.45, clearcoatRoughness: 0.16 } },
  flowingMoltenGlass: { label: "流动熔融玻璃", focus: "温度、黏度、流动形变、吸收与辐射", kind: "moltenGlass", runtimeMode: "hybrid", seed: 907, scale: 4.8, detail: 5, amount: 0.76, color: [0.42, 0.12, 0.035], accentColor: [1, 0.36, 0.035], roughness: 0.06, displacement: 0.42, time: 2.5, normalStrength: 5, volume: { density: 0.24, temperature: 0.92, humidity: 0, buoyancy: 0.08, shape: "plume" }, physical: { ...physicalBase, ior: 1.52, thickness: 0.9, emissiveIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.025, iridescence: 0.06, attenuationDistance: 0.7, attenuationColor: [0.72, 0.18, 0.035], dispersion: 0.028 } },
  displacedBarkMossGrowth: { label: "位移树皮与苔藓生长", focus: "多尺度树皮、裂片、附着生长与微位移", kind: "barkMoss", runtimeMode: "surface", seed: 908, scale: 7.6, detail: 7, amount: 0.62, color: [0.2, 0.105, 0.045], accentColor: [0.18, 0.36, 0.07], roughness: 0.84, displacement: 0.94, time: 3, normalStrength: 15, volume: emptyVolume, physical: { ...physicalBase, ior: 1.46, sheen: 0.16, sheenRoughness: 0.72 } },
  geometricWovenYarn: { label: "真实纱线编织布", focus: "经纬纱、交叠、毛羽、各向异性与 LOD", kind: "wovenYarn", runtimeMode: "surface", seed: 909, scale: 9.2, detail: 6, amount: 0.74, color: [0.12, 0.24, 0.38], accentColor: [0.56, 0.18, 0.12], roughness: 0.58, displacement: 0.74, time: 0, normalStrength: 11, volume: emptyVolume, physical: { ...physicalBase, ior: 1.5, sheen: 0.68, sheenRoughness: 0.5 } },
  anisotropicLayeredFeather: { label: "各向异性分层羽毛", focus: "羽轴、羽枝、薄层透射、虹彩与透明边缘", kind: "feather", runtimeMode: "surface", seed: 910, scale: 8.4, detail: 7, amount: 0.7, color: [0.12, 0.15, 0.18], accentColor: [0.08, 0.48, 0.56], roughness: 0.36, displacement: 0.54, time: 0, normalStrength: 7, volume: emptyVolume, physical: { ...physicalBase, ior: 1.54, alphaCutoff: 0.2, sheen: 0.72, sheenRoughness: 0.28, iridescence: 0.18, iridescenceIor: 1.38, attenuationColor: [0.58, 0.76, 0.82] } },
} satisfies Record<string, NinthBatchMaterialDefinition>;

export type NinthBatchMaterialName = keyof typeof NINTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: NinthBatchMaterialName) {
  return (size: number, params: NinthBatchMaterialParams = {}): NinthBatchMaterial => (
    buildNinthBatchMaterial(NINTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const NINTH_BATCH_MATERIALS = {
  evolvingCumulusCloud: builder("evolvingCumulusCloud"),
  combustionFireAndSmoke: builder("combustionFireAndSmoke"),
  spectralOceanSeafoam: builder("spectralOceanSeafoam"),
  compactedSnowIceCrust: builder("compactedSnowIceCrust"),
  foldedErodedRockStrata: builder("foldedErodedRockStrata"),
  deformableWetSandMud: builder("deformableWetSandMud"),
  flowingMoltenGlass: builder("flowingMoltenGlass"),
  displacedBarkMossGrowth: builder("displacedBarkMossGrowth"),
  geometricWovenYarn: builder("geometricWovenYarn"),
  anisotropicLayeredFeather: builder("anisotropicLayeredFeather"),
};

export const NINTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(NINTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "机制强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
    { key: "displacement", label: "位移强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.displacement },
    { key: "time", label: "演化时间", type: "range", min: 0, max: 10, step: 0.1, default: definition.time },
  ] satisfies NinthBatchMaterialParamSpec[]]),
) as Record<NinthBatchMaterialName, NinthBatchMaterialParamSpec[]>;

export function defaultNinthBatchMaterialParams(name: NinthBatchMaterialName): NinthBatchMaterialParams {
  const params: NinthBatchMaterialParams = {};
  for (const spec of NINTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}

export interface NinthBatchMaterialBundle {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly manifest: {
    readonly schema: "MeshovaVolumeMaterial";
    readonly version: 1;
    readonly mode: NinthBatchRuntime["mode"];
    readonly surfaceManifest: string;
    readonly volumeData: string;
    readonly volumeShader: string;
    readonly referenceReport: string;
  };
}

/** Export surface runtime bundle plus interleaved 3D field and CPU reference report. */
export function exportNinthBatchMaterialBundle(
  material: NinthBatchMaterial,
  baseName = "material",
): NinthBatchMaterialBundle {
  const surface = exportRealtimeMaterialBundle(material, baseName);
  const volumeData = `${baseName}.volume.f32`;
  const volumeDescriptor = `${baseName}.volume.json`;
  const volumeShader = `${baseName}.volume.wgsl`;
  const referenceReport = `${baseName}.reference.json`;
  const manifestName = `${baseName}.ninth.json`;
  const volume = material.ninthBatchRuntime.volume;
  const descriptor = {
    schema: "MeshovaVolumeField",
    version: 1,
    dimensions: [volume.width, volume.height, volume.depth],
    layout: ["density", "temperature", "humidity", "velocityX", "velocityY", "velocityZ"],
    format: "float32-little-endian",
    data: volumeData,
  };
  const manifest = {
    schema: "MeshovaVolumeMaterial" as const,
    version: 1 as const,
    mode: material.ninthBatchRuntime.mode,
    surfaceManifest: `${baseName}.realtime.json`,
    volumeData,
    volumeShader,
    referenceReport,
  };
  return {
    files: {
      ...surface.files,
      [volumeData]: serializeVolumeField(volume),
      [volumeDescriptor]: encodeUtf8(JSON.stringify(descriptor, null, 2)),
      [volumeShader]: encodeUtf8(material.ninthBatchRuntime.volumeWgsl),
      [referenceReport]: encodeUtf8(JSON.stringify({
        ...material.ninthBatchRuntime.volumeReference,
        displacement: material.ninthBatchRuntime.displacement,
      }, null, 2)),
      [manifestName]: encodeUtf8(JSON.stringify(manifest, null, 2)),
    },
    manifest,
  };
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 0x3f);
    else bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return Uint8Array.from(bytes);
}
