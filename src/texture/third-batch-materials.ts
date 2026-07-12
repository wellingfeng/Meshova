import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { blendColor, voronoi } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import {
  assembleExtendedMaterial,
  buildCoverageMasks,
  deriveHeightFeatures,
  makeDirectionField,
  sampleDirection,
  type ExtendedMaterial,
  type ExtendedMaterialPhysical,
} from "./material-mechanics.js";

type RGB = [number, number, number];

type ThirdBatchMaterialKind =
  | "snowMelt"
  | "wetMud"
  | "glacierIce"
  | "machinedMetal"
  | "veinedMarble"
  | "coolingLava"
  | "wornAsphalt"
  | "spalledConcrete"
  | "vascularLeaf"
  | "sciFiPanel";

export interface ThirdBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface ThirdBatchMaterialParamSpec {
  key: keyof ThirdBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface ThirdBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: ThirdBatchMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  normalStrength: number;
  physical: ExtendedMaterialPhysical;
}

interface SampleContext {
  definition: ThirdBatchMaterialDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: ReturnType<typeof voronoi>;
  cracks: ReturnType<typeof voronoi>;
  direction: TextureBuffer;
  seed: number;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
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
  feature: number;
}

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);
const clamp01 = (value: number) => clamp(value, 0, 1);

function shade(color: RGB, value: number): RGB {
  return [clamp01(color[0] * value), clamp01(color[1] * value), clamp01(color[2] * value)];
}

function mixColor(left: RGB, right: RGB, amount: number): RGB {
  return blendColor(left, right, clamp01(amount));
}

function hash2(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);
}

function gridCell(u: number, v: number, columns: number, rows: number, stagger = 0) {
  const row = Math.floor(v * rows);
  const shifted = u * columns + (row % 2) * stagger;
  return {
    column: Math.floor(shifted),
    row,
    localU: fract(shifted),
    localV: fract(v * rows),
  };
}

function sampleMaterial(context: SampleContext, u: number, v: number, x: number, y: number): MaterialSample {
  const { definition, noise, detailNoise, cells, cracks, scale, detail, amount, color, accentColor, roughness, seed } = context;
  const broad = fbm2(noise, u * scale * 0.45, v * scale * 0.45, { octaves: 5 }) * 0.5 + 0.5;
  const fine = fbm2(detailNoise, u * scale * detail, v * scale * detail, { octaves: 4 }) * 0.5 + 0.5;
  const base: MaterialSample = {
    baseColor: shade(color, 0.78 + broad * 0.34),
    height: clamp01(0.25 + broad * 0.45 + fine * 0.08),
    metallic: 0,
    roughness: clamp01(roughness + fine * 0.08),
    ao: clamp01(0.72 + broad * 0.28),
    emission: [0, 0, 0],
    opacity: 1,
    transmission: 0,
    anisotropy: 0,
    anisotropyRotation: 0,
    feature: 0,
  };

  switch (definition.kind) {
    case "snowMelt": {
      const rock = smoothstep(0.4, 0.1, cells(u, v));
      return {
        ...base,
        baseColor: mixColor(accentColor, color, broad * 0.16),
        height: clamp01(0.18 + broad * 0.5 + rock * 0.2 + fine * 0.04),
        roughness: roughness,
        feature: rock,
      };
    }
    case "wetMud": {
      const pebble = smoothstep(0.34, 0.08, cells(u, v));
      const rut = Math.pow(0.5 + Math.sin((u * scale * 0.7 + broad * 0.2) * TAU) * 0.5, 7) * amount;
      return {
        ...base,
        baseColor: mixColor(color, accentColor, pebble * 0.42),
        height: clamp01(0.2 + broad * 0.36 + pebble * 0.22 - rut * 0.18 + fine * 0.035),
        roughness,
        feature: rut,
      };
    }
    case "glacierIce": {
      const fissure = 1 - smoothstep(0.018, 0.085, cracks(u, v));
      const bubble = smoothstep(0.22, 0.055, cells(u * detail * 0.7, v * detail * 0.7));
      const striation = Math.pow(0.5 + Math.sin((v * scale * 2.2 + broad * 0.3) * TAU) * 0.5, 5);
      return {
        ...base,
        baseColor: mixColor(color, accentColor, fissure * 0.82 + bubble * 0.2),
        height: clamp01(0.52 + striation * 0.06 + fine * 0.025 - fissure * 0.3),
        roughness: clamp01(roughness + fissure * 0.42 + bubble * 0.16),
        ao: clamp01(1 - fissure * 0.5),
        transmission: clamp01(0.88 - fissure * 0.7 - bubble * 0.24),
        feature: fissure,
      };
    }
    case "machinedMetal": {
      const [directionX, directionY] = sampleDirection(context.direction, x, y);
      const projected = u * directionX + v * directionY;
      const groove = 0.5 + Math.sin((projected * scale * detail * 22 + fine * 0.28) * TAU) * 0.5;
      const toolBand = 0.5 + Math.sin((Math.hypot(u - 0.5, v - 0.5) * scale * 8 + broad) * TAU) * 0.5;
      const angle = Math.atan2(directionY, directionX);
      return {
        ...base,
        baseColor: mixColor(color, accentColor, groove * 0.28 + toolBand * 0.12),
        height: clamp01(0.48 + groove * 0.035 * amount + toolBand * 0.012),
        metallic: 1,
        roughness: clamp01(roughness + groove * 0.18),
        anisotropy: clamp01(0.55 + amount * 0.4),
        anisotropyRotation: fract(angle / TAU + 1),
        feature: groove,
      };
    }
    case "veinedMarble": {
      const [directionX, directionY] = sampleDirection(context.direction, x, y);
      const warp = noise.noise3(u * scale * 0.38, v * scale * 0.38, broad * 1.7) * 0.32;
      const coordinate = u * directionX + v * directionY + warp;
      const primary = Math.pow(Math.abs(Math.sin((coordinate * scale * 1.8 + fine * 0.16) * TAU)), 11);
      const secondary = Math.pow(Math.abs(Math.sin((coordinate * scale * 4.7 - broad * 0.7) * TAU)), 18) * 0.45;
      const vein = clamp01((primary + secondary) * amount);
      return {
        ...base,
        baseColor: mixColor(color, accentColor, vein),
        height: clamp01(0.5 + broad * 0.035 - vein * 0.045),
        roughness: clamp01(roughness + vein * 0.16),
        ao: clamp01(1 - vein * 0.08),
        feature: vein,
      };
    }
    case "coolingLava": {
      const crack = 1 - smoothstep(0.012, 0.075, cracks(u, v));
      const crust = clamp01(1 - crack);
      const glow = clamp01(crack * (0.72 + fine * 0.45) * amount);
      return {
        ...base,
        baseColor: mixColor(accentColor, color, crust * 0.92),
        height: clamp01(0.16 + crust * (0.36 + broad * 0.28) - crack * 0.08),
        roughness: clamp01(roughness + crust * 0.16 - glow * 0.2),
        ao: clamp01(0.72 + crust * 0.28 - crack * 0.22),
        emission: [glow, glow * 0.16, glow * 0.015],
        feature: crack,
      };
    }
    case "wornAsphalt": {
      const aggregate = smoothstep(0.3, 0.07, cells(u * 1.6, v * 1.6));
      const crack = 1 - smoothstep(0.012, 0.052, cracks(u, v));
      const stripeDistance = Math.abs(fract(u * 2) - 0.5);
      const marking = smoothstep(0.12, 0.06, stripeDistance) * smoothstep(0.36, 0.6, hash2(Math.floor(v * 12), 0, seed) * 0.45 + fine * 0.55);
      const patchCell = gridCell(u, v, Math.max(2, Math.round(scale * 0.35)), Math.max(2, Math.round(scale * 0.35)));
      const patchEdge = Math.min(patchCell.localU, 1 - patchCell.localU, patchCell.localV, 1 - patchCell.localV);
      const patch = smoothstep(0.04, 0.13, patchEdge) * smoothstep(0.62, 0.82, hash2(patchCell.column, patchCell.row, seed));
      const wearMask = clamp01(marking * (1 - fine * amount));
      return {
        ...base,
        baseColor: mixColor(mixColor(color, accentColor, aggregate * 0.2 + patch * 0.16), [0.72, 0.67, 0.42], wearMask),
        height: clamp01(0.3 + broad * 0.16 + aggregate * 0.12 - crack * 0.24 + patch * 0.035),
        roughness: clamp01(roughness + aggregate * 0.1 - patch * 0.08),
        ao: clamp01(1 - crack * 0.38),
        feature: crack,
      };
    }
    case "spalledConcrete": {
      const aggregate = smoothstep(0.36, 0.09, cells(u * 1.4, v * 1.4));
      const spall = smoothstep(0.55, 0.78, broad) * amount;
      const crack = 1 - smoothstep(0.01, 0.06, cracks(u, v));
      const rebarX = smoothstep(0.045, 0.018, Math.abs(fract(u * Math.max(2, scale * 0.38)) - 0.5));
      const rebarY = smoothstep(0.045, 0.018, Math.abs(fract(v * Math.max(2, scale * 0.38)) - 0.5));
      const rebar = Math.max(rebarX, rebarY) * spall;
      return {
        ...base,
        baseColor: mixColor(mixColor(color, accentColor, aggregate * spall), [0.24, 0.07, 0.018], rebar),
        height: clamp01(0.48 + fine * 0.055 - spall * 0.28 + aggregate * spall * 0.16 + rebar * 0.13 - crack * 0.16),
        metallic: rebar,
        roughness: clamp01(roughness + aggregate * 0.08 - rebar * 0.28),
        ao: clamp01(1 - spall * 0.32 - crack * 0.3),
        feature: spall,
      };
    }
    case "vascularLeaf": {
      const px = (u - 0.5) / 0.43;
      const py = (v - 0.5) / 0.49;
      const shape = smoothstep(1.02, 0.94, Math.abs(px) * 0.64 + py * py);
      const midrib = smoothstep(0.032, 0.008, Math.abs(px));
      const branchPhase = Math.abs(px) - Math.abs(py) * 0.36;
      const branches = smoothstep(0.04, 0.012, Math.abs(fract((branchPhase + 0.5) * scale * 0.72) - 0.5)) * smoothstep(0.05, 0.42, Math.abs(px));
      const veins = clamp01(Math.max(midrib, branches * 0.72) * shape);
      const serration = 0.96 + Math.sin(Math.atan2(py, px) * Math.max(8, Math.round(scale * 2))) * 0.025 * amount;
      const opacity = smoothstep(serration + 0.025, serration - 0.025, Math.abs(px) * 0.64 + py * py);
      return {
        ...base,
        baseColor: mixColor(color, accentColor, veins * 0.72 + broad * 0.16),
        height: clamp01(0.42 + veins * 0.23 + fine * 0.025),
        roughness: clamp01(roughness + fine * 0.08),
        ao: clamp01(0.9 + veins * 0.1),
        opacity,
        transmission: opacity * (0.12 + amount * 0.18),
        feature: veins,
      };
    }
    case "sciFiPanel": {
      const columns = Math.max(3, Math.round(scale * 0.75));
      const rows = Math.max(3, Math.round(scale * 0.58));
      const cell = gridCell(u, v, columns, rows, 0.5);
      const edgeDistance = Math.min(cell.localU, 1 - cell.localU, cell.localV, 1 - cell.localV);
      const seam = 1 - smoothstep(0.018, 0.065, edgeDistance);
      const screwDistance = Math.min(
        Math.hypot(cell.localU - 0.1, cell.localV - 0.1),
        Math.hypot(cell.localU - 0.9, cell.localV - 0.9),
      );
      const screw = smoothstep(0.065, 0.03, screwDistance);
      const vent = smoothstep(0.055, 0.022, Math.abs(fract(cell.localU * 7) - 0.5)) * smoothstep(0.2, 0.8, cell.localV);
      const panelValue = hash2(cell.column, cell.row, seed);
      const light = smoothstep(0.82, 0.94, panelValue) * smoothstep(0.12, 0.06, Math.abs(cell.localV - 0.5));
      return {
        ...base,
        baseColor: mixColor(mixColor(color, accentColor, panelValue * 0.32), [0.02, 0.5, 0.82], light),
        height: clamp01(0.46 + panelValue * 0.055 - seam * 0.24 - vent * 0.12 + screw * 0.09),
        metallic: clamp01(0.7 + screw * 0.3),
        roughness: clamp01(roughness + seam * 0.14 - screw * 0.16),
        ao: clamp01(1 - seam * 0.38 - vent * 0.26),
        emission: [light * 0.02, light * 0.52, light],
        feature: seam,
      };
    }
  }
}

function writeColor(target: TextureBuffer, pixel: number, color: RGB): void {
  const index = pixel * 3;
  target.data[index] = clamp01(color[0]);
  target.data[index + 1] = clamp01(color[1]);
  target.data[index + 2] = clamp01(color[2]);
}

export function buildThirdBatchMaterial(
  definition: ThirdBatchMaterialDefinition,
  size: number,
  params: ThirdBatchMaterialParams = {},
): ExtendedMaterial {
  if (!Number.isInteger(size) || size < 1) throw new Error("size must be a positive integer");
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const context: SampleContext = {
    definition,
    noise: makeNoise(seed),
    detailNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(3, scale * 1.2), seed: seed + 13, metric: "f1" }),
    cracks: voronoi({ scale: Math.max(2, scale * 0.82), seed: seed + 29, metric: "f2-f1" }),
    direction: makeDirectionField(size, {
      mode: definition.kind === "machinedMetal" ? "radial" : "linear",
      angle: definition.kind === "machinedMetal" ? Math.PI * 0.5 : 0.32,
      turbulence: definition.kind === "veinedMarble" ? 0.9 : 0.24,
      scale: Math.max(2, scale * 0.5),
      seed: seed + 47,
    }),
    seed,
    scale,
    detail: params.detail ?? definition.detail,
    amount: params.amount ?? definition.amount,
    color: params.color ?? definition.color,
    accentColor: params.accentColor ?? definition.accentColor,
    roughness: params.roughness ?? definition.roughness,
  };

  const samples = new Array<MaterialSample>(size * size);
  const height = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const pixel = y * size + x;
      const materialSample = sampleMaterial(context, u, v, x, y);
      samples[pixel] = materialSample;
      height.data[pixel] = materialSample.height;
    }
  }

  const coverage = definition.kind === "snowMelt"
    ? buildCoverageMasks(height, {
      level: 0.38,
      softness: 0.16,
      slopeLimit: 0.72,
      melt: context.amount,
      wetness: 0.9,
    })
    : null;
  const terrain = definition.kind === "wetMud" ? deriveHeightFeatures(height, { slopeStrength: 10, cavityStrength: 16 }) : null;
  const baseColor = makeTexture(size, size, 3);
  const metallic = makeTexture(size, size, 1);
  const roughness = makeTexture(size, size, 1);
  const ao = makeTexture(size, size, 1);
  const emission = makeTexture(size, size, 3);
  const opacity = makeTexture(size, size, 1);
  const transmission = makeTexture(size, size, 1);
  const anisotropy = makeTexture(size, size, 1);
  const anisotropyRotation = makeTexture(size, size, 1);

  for (let pixel = 0; pixel < samples.length; pixel++) {
    const materialSample = samples[pixel]!;
    let color = materialSample.baseColor;
    let heightValue = materialSample.height;
    let roughnessValue = materialSample.roughness;
    let transmissionValue = materialSample.transmission;
    if (coverage) {
      const snow = coverage.coverage.data[pixel]!;
      const meltBoundary = coverage.boundary.data[pixel]! * context.amount;
      color = mixColor(shade(context.accentColor, 0.75 + materialSample.feature * 0.18), shade(context.color, 0.92 + materialSample.feature * 0.08), snow);
      color = mixColor(color, shade(context.accentColor, 0.46), meltBoundary * 0.65);
      heightValue = clamp01(heightValue + snow * 0.11 - meltBoundary * 0.025);
      roughnessValue = clamp01(context.roughness * snow + (0.68 - meltBoundary * 0.44) * (1 - snow));
      transmissionValue = snow * 0.06;
    }
    if (terrain) {
      const puddle = smoothstep(0.4, 0.8, terrain.flow.data[pixel]! * 0.72 + terrain.sediment.data[pixel]! * 0.52 + terrain.cavity.data[pixel]! * 0.2) * context.amount;
      color = mixColor(color, shade(context.color, 0.34), puddle);
      roughnessValue = clamp01(context.roughness * (1 - puddle) + 0.08 * puddle);
      heightValue = clamp01(heightValue - puddle * 0.045);
      transmissionValue = puddle * 0.08;
    }
    height.data[pixel] = heightValue;
    writeColor(baseColor, pixel, color);
    metallic.data[pixel] = clamp01(materialSample.metallic);
    roughness.data[pixel] = clamp(roughnessValue, 0.04, 1);
    ao.data[pixel] = clamp01(materialSample.ao);
    writeColor(emission, pixel, materialSample.emission);
    opacity.data[pixel] = clamp01(materialSample.opacity);
    transmission.data[pixel] = clamp01(transmissionValue);
    anisotropy.data[pixel] = clamp01(materialSample.anisotropy);
    anisotropyRotation.data[pixel] = clamp01(materialSample.anisotropyRotation);
  }

  return assembleExtendedMaterial(
    { baseColor, metallic, roughness, ao, height, emission, normal: heightToNormal(height, definition.normalStrength) },
    { opacity, transmission, anisotropy, anisotropyRotation, physical: definition.physical },
    definition.normalStrength,
  );
}

const opaquePhysical: ExtendedMaterialPhysical = { ior: 1.5, thickness: 0, emissiveIntensity: 1, alphaCutoff: 0 };

export const THIRD_BATCH_MATERIAL_DEFINITIONS = {
  meltingSnow: { label: "雪地与融雪", focus: "覆盖层、坡度遮罩、融化边界", kind: "snowMelt", seed: 301, scale: 7, detail: 5, amount: 0.48, color: [0.88, 0.94, 0.98], accentColor: [0.17, 0.15, 0.13], roughness: 0.88, normalStrength: 5, physical: { ...opaquePhysical, ior: 1.31 } },
  wetMudPuddles: { label: "湿泥与积水", focus: "集水、湿度传播、分层粗糙度", kind: "wetMud", seed: 302, scale: 8, detail: 5, amount: 0.72, color: [0.13, 0.07, 0.028], accentColor: [0.29, 0.18, 0.08], roughness: 0.86, normalStrength: 6, physical: { ...opaquePhysical, ior: 1.33, thickness: 0.04 } },
  fracturedGlacierIce: { label: "冰川与碎冰", focus: "透射、内部裂纹、气泡与层理", kind: "glacierIce", seed: 303, scale: 7, detail: 5, amount: 0.78, color: [0.42, 0.72, 0.86], accentColor: [0.82, 0.95, 1], roughness: 0.2, normalStrength: 4, physical: { ior: 1.31, thickness: 0.8, emissiveIntensity: 1, alphaCutoff: 0 } },
  machinedBrushedMetal: { label: "拉丝机加工金属", focus: "各向异性、环形刀纹、方向扰动", kind: "machinedMetal", seed: 304, scale: 8, detail: 5, amount: 0.82, color: [0.42, 0.44, 0.46], accentColor: [0.72, 0.74, 0.76], roughness: 0.24, normalStrength: 7, physical: opaquePhysical },
  continuousVeinMarble: { label: "连续脉络大理石", focus: "三维噪声脉络、连续方向场", kind: "veinedMarble", seed: 305, scale: 6, detail: 5, amount: 0.82, color: [0.72, 0.69, 0.64], accentColor: [0.13, 0.16, 0.18], roughness: 0.3, normalStrength: 3, physical: opaquePhysical },
  coolingLava: { label: "冷却熔岩", focus: "发光裂隙、冷却壳、裂缝扩张", kind: "coolingLava", seed: 306, scale: 8, detail: 5, amount: 0.9, color: [0.045, 0.035, 0.028], accentColor: [0.38, 0.055, 0.008], roughness: 0.68, normalStrength: 7, physical: { ...opaquePhysical, emissiveIntensity: 5 } },
  wornAsphaltRoad: { label: "磨损沥青道路", focus: "骨料、裂缝、补丁、标线磨损", kind: "wornAsphalt", seed: 307, scale: 9, detail: 5, amount: 0.64, color: [0.055, 0.052, 0.048], accentColor: [0.18, 0.17, 0.15], roughness: 0.86, normalStrength: 6, physical: opaquePhysical },
  spalledRebarConcrete: { label: "露筋破损混凝土", focus: "骨料暴露、钢筋、剥落层", kind: "spalledConcrete", seed: 308, scale: 8, detail: 5, amount: 0.62, color: [0.42, 0.4, 0.37], accentColor: [0.19, 0.17, 0.14], roughness: 0.88, normalStrength: 7, physical: opaquePhysical },
  vascularLeaf: { label: "叶片与叶脉", focus: "SDF 轮廓、分叉叶脉、透明裁剪", kind: "vascularLeaf", seed: 309, scale: 10, detail: 5, amount: 0.58, color: [0.055, 0.28, 0.045], accentColor: [0.38, 0.58, 0.08], roughness: 0.72, normalStrength: 4, physical: { ior: 1.42, thickness: 0.03, emissiveIntensity: 1, alphaCutoff: 0.18 } },
  sciFiHardSurfacePanel: { label: "科幻硬表面面板", focus: "面板切割、螺钉、通风口、发光贴花", kind: "sciFiPanel", seed: 310, scale: 8, detail: 4, amount: 0.7, color: [0.07, 0.085, 0.1], accentColor: [0.3, 0.34, 0.38], roughness: 0.38, normalStrength: 7, physical: { ...opaquePhysical, emissiveIntensity: 3 } },
} as const satisfies Record<string, ThirdBatchMaterialDefinition>;

export type ThirdBatchMaterialName = keyof typeof THIRD_BATCH_MATERIAL_DEFINITIONS;

function recipe(name: ThirdBatchMaterialName) {
  return (size: number, params: ThirdBatchMaterialParams = {}) => (
    buildThirdBatchMaterial(THIRD_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const THIRD_BATCH_MATERIALS = {
  meltingSnow: recipe("meltingSnow"),
  wetMudPuddles: recipe("wetMudPuddles"),
  fracturedGlacierIce: recipe("fracturedGlacierIce"),
  machinedBrushedMetal: recipe("machinedBrushedMetal"),
  continuousVeinMarble: recipe("continuousVeinMarble"),
  coolingLava: recipe("coolingLava"),
  wornAsphaltRoad: recipe("wornAsphaltRoad"),
  spalledRebarConcrete: recipe("spalledRebarConcrete"),
  vascularLeaf: recipe("vascularLeaf"),
  sciFiHardSurfacePanel: recipe("sciFiHardSurfacePanel"),
} as const;

export const THIRD_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(THIRD_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 2, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "amount", label: "机制强度", type: "range", min: 0, max: 1, step: 0.02, default: definition.amount },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies ThirdBatchMaterialParamSpec[]]),
) as Record<ThirdBatchMaterialName, ThirdBatchMaterialParamSpec[]>;

export function defaultThirdBatchMaterialParams(name: ThirdBatchMaterialName): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const spec of THIRD_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    params[spec.key] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  return params;
}
