import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { assembleExtendedMaterial, type ExtendedMaterialPhysical } from "./material-mechanics.js";
import { blendColor, voronoi } from "./patterns.js";
import { heightToNormal } from "./pbr.js";
import {
  assembleLayeredMaterial,
  beerLambertAbsorption,
  buildThicknessField,
  growCracks,
  makeFiberTensorField,
  reactionDiffusion,
  thinFilmInterference,
  weatheringTransport,
  type LayeredMaterial,
  type LayeredMaterialPhysical,
} from "./shading-mechanics.js";

type RGB = [number, number, number];

type FourthBatchMaterialKind =
  | "automotivePaint"
  | "jadeWax"
  | "velvetSilk"
  | "nacreFilm"
  | "patinatedCopper"
  | "crackleGlaze"
  | "charredWood"
  | "tidalBeach"
  | "biologicalColony"
  | "weatheredWall";

export interface FourthBatchMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  amount?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface FourthBatchMaterialParamSpec {
  key: keyof FourthBatchMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface FourthBatchMaterialDefinition {
  label: string;
  focus: string;
  kind: FourthBatchMaterialKind;
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

interface SampleContext {
  definition: FourthBatchMaterialDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: ReturnType<typeof voronoi>;
  ridges: ReturnType<typeof voronoi>;
  scale: number;
  detail: number;
  amount: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  reaction?: TextureBuffer;
  crack?: TextureBuffer;
  crackHierarchy?: TextureBuffer;
  crackLift?: TextureBuffer;
  moisture?: TextureBuffer;
  salt?: TextureBuffer;
  mold?: TextureBuffer;
  peel?: TextureBuffer;
  fiberDirection?: TextureBuffer;
  fiberAnisotropy?: TextureBuffer;
  fiberCrossing?: TextureBuffer;
  filmColor?: TextureBuffer;
  thickness?: TextureBuffer;
  absorbedColor?: TextureBuffer;
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

function shade(color: RGB, value: number): RGB {
  return [clamp01(color[0] * value), clamp01(color[1] * value), clamp01(color[2] * value)];
}

function readColor(texture: TextureBuffer | undefined, pixel: number, fallback: RGB): RGB {
  if (!texture) return fallback;
  return [texture.data[pixel * 3]!, texture.data[pixel * 3 + 1]!, texture.data[pixel * 3 + 2]!];
}

function writeColor(texture: TextureBuffer, pixel: number, color: RGB): void {
  texture.data[pixel * 3] = clamp01(color[0]);
  texture.data[pixel * 3 + 1] = clamp01(color[1]);
  texture.data[pixel * 3 + 2] = clamp01(color[2]);
}

function readScalar(texture: TextureBuffer | undefined, pixel: number, fallback = 0): number {
  return texture?.data[pixel] ?? fallback;
}

function baseHeight(
  size: number,
  noise: Noise,
  detailNoise: Noise,
  scale: number,
  detail: number,
): TextureBuffer {
  const height = makeTexture(size, size, 1);
  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const broad = fbm2(noise, u * scale * 0.55, v * scale * 0.55, { octaves: 5 }) * 0.5 + 0.5;
      const fine = fbm2(detailNoise, u * scale * detail, v * scale * detail, { octaves: 4 }) * 0.5 + 0.5;
      height.data[y * size + x] = clamp01(0.28 + broad * 0.44 + fine * 0.08);
    }
  }
  return height;
}

function prepareContext(
  definition: FourthBatchMaterialDefinition,
  size: number,
  params: FourthBatchMaterialParams,
): { context: SampleContext; height: TextureBuffer } {
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const amount = params.amount ?? definition.amount;
  const noise = makeNoise(seed);
  const detailNoise = makeNoise(seed + 101);
  const height = baseHeight(size, noise, detailNoise, scale, detail);
  const context: SampleContext = {
    definition,
    noise,
    detailNoise,
    cells: voronoi({ scale: Math.max(3, scale * 1.2), seed: seed + 17, metric: "f1" }),
    ridges: voronoi({ scale: Math.max(3, scale * 0.82), seed: seed + 19, metric: "f2-f1" }),
    scale,
    detail,
    amount,
    color: params.color ?? definition.color,
    accentColor: params.accentColor ?? definition.accentColor,
    roughness: params.roughness ?? definition.roughness,
  };
  if (definition.kind === "patinatedCopper" || definition.kind === "crackleGlaze" || definition.kind === "biologicalColony") {
    context.reaction = reactionDiffusion(size, {
      seed: seed + 23,
      iterations: Math.max(48, Math.round(size * 0.65)),
      feed: definition.kind === "biologicalColony" ? 0.036 : 0.054,
      kill: definition.kind === "biologicalColony" ? 0.062 : 0.061,
      spots: Math.max(3, Math.round(scale)),
    }).pattern;
  }
  if (definition.kind === "crackleGlaze" || definition.kind === "charredWood" || definition.kind === "weatheredWall") {
    const cracks = growCracks(size, {
      seed: seed + 37,
      starts: Math.max(2, Math.round(scale * 0.45)),
      steps: Math.max(12, size * 1.4),
      branchChance: 0.035 + amount * 0.06,
      turn: definition.kind === "charredWood" ? 0.08 : 0.24,
      width: definition.kind === "charredWood" ? 0.9 : 1.25,
    });
    context.crack = cracks.crack;
    context.crackHierarchy = cracks.hierarchy;
    context.crackLift = cracks.edgeLift;
  }
  if (definition.kind === "patinatedCopper" || definition.kind === "tidalBeach" || definition.kind === "weatheredWall") {
    const weathering = weatheringTransport(height, {
      seed: seed + 53,
      iterations: Math.max(6, Math.round(detail * 2)),
      rainfall: definition.kind === "tidalBeach" ? 0.9 : amount,
      porosity: definition.kind === "weatheredWall" ? 0.8 : 0.55,
      salt: definition.kind === "tidalBeach" || definition.kind === "weatheredWall" ? 0.9 : 0.48,
      mold: definition.kind === "weatheredWall" ? 0.9 : 0.42,
    });
    context.moisture = weathering.moisture;
    context.salt = weathering.salt;
    context.mold = weathering.mold;
    context.peel = weathering.peel;
  }
  if (definition.kind === "velvetSilk" || definition.kind === "charredWood") {
    const fibers = makeFiberTensorField(size, {
      seed: seed + 71,
      angle: definition.kind === "charredWood" ? Math.PI * 0.5 : 0.12,
      scale,
      turbulence: definition.kind === "charredWood" ? 0.16 : 0.42,
      crossWeave: definition.kind === "velvetSilk" ? 0.72 : 0,
    });
    context.fiberDirection = fibers.direction;
    context.fiberAnisotropy = fibers.anisotropy;
    context.fiberCrossing = fibers.crossing;
  }
  if (definition.kind === "jadeWax" || definition.kind === "nacreFilm" || definition.kind === "biologicalColony") {
    const mask = makeTexture(size, size, 1);
    mask.data.fill(1);
    context.thickness = buildThicknessField(mask, { height, maximum: 1, heightInfluence: 0.82 });
  }
  if (definition.kind === "jadeWax" && context.thickness) {
    context.absorbedColor = beerLambertAbsorption(context.color, context.thickness, [0.8, 0.16, 0.55]);
  }
  if (definition.kind === "nacreFilm" && context.thickness) {
    context.filmColor = thinFilmInterference(context.thickness, { ior: 1.52, strength: amount });
  }
  return { context, height };
}

function sampleMaterial(
  context: SampleContext,
  u: number,
  v: number,
  x: number,
  y: number,
  pixel: number,
): MaterialSample {
  const { definition, noise, detailNoise, scale, detail, amount, color, accentColor, roughness } = context;
  const broad = fbm2(noise, u * scale * 0.5, v * scale * 0.5, { octaves: 5 }) * 0.5 + 0.5;
  const fine = fbm2(detailNoise, u * scale * detail, v * scale * detail, { octaves: 4 }) * 0.5 + 0.5;
  const base: MaterialSample = {
    baseColor: shade(color, 0.78 + broad * 0.32),
    height: clamp01(0.3 + broad * 0.42 + fine * 0.08),
    metallic: 0,
    roughness: clamp(roughness + fine * 0.08, 0.04, 1),
    ao: clamp01(0.72 + broad * 0.28),
    emission: [0, 0, 0],
    opacity: 1,
    transmission: 0,
    anisotropy: 0,
    anisotropyRotation: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    sheen: 0,
    sheenColor: [1, 1, 1],
    thickness: readScalar(context.thickness, pixel),
    subsurface: 0,
    iridescence: 0,
    iridescenceThickness: readScalar(context.thickness, pixel, 0.5),
  };
  switch (definition.kind) {
    case "automotivePaint": {
      const orangePeel = fbm2(detailNoise, u * scale * 8, v * scale * 8, { octaves: 3 }) * 0.5 + 0.5;
      const flake = smoothstep(0.76, 0.94, fine) * amount;
      return {
        ...base,
        baseColor: mixColor(shade(color, 0.66 + broad * 0.24), accentColor, flake * 0.52),
        height: clamp01(0.48 + orangePeel * 0.035 + flake * 0.012),
        metallic: clamp01(0.72 + flake * 0.28),
        roughness: clamp(roughness + orangePeel * 0.09 - flake * 0.05, 0.04, 1),
        clearcoat: clamp01(0.82 + amount * 0.18),
        clearcoatRoughness: clamp01(0.035 + orangePeel * 0.11),
        iridescence: flake * 0.24,
        iridescenceThickness: flake,
      };
    }
    case "jadeWax": {
      const vein = 1 - smoothstep(0.025, 0.11, context.ridges(u, v));
      const absorbed = readColor(context.absorbedColor, pixel, color);
      const cloudy = clamp01(broad * 0.5 + vein * 0.5);
      return {
        ...base,
        baseColor: mixColor(absorbed, accentColor, vein * 0.38),
        height: clamp01(0.48 + broad * 0.035 + vein * 0.018),
        roughness: clamp01(roughness + cloudy * 0.12),
        transmission: clamp01(0.34 + amount * 0.5 - vein * 0.16),
        clearcoat: 0.34,
        clearcoatRoughness: 0.16,
        thickness: readScalar(context.thickness, pixel, 0.5),
        subsurface: clamp01(0.62 + amount * 0.34 - vein * 0.14),
      };
    }
    case "velvetSilk": {
      const directionX = readScalar(context.fiberDirection, pixel * 2) * 2 - 1;
      const directionY = context.fiberDirection?.data[pixel * 2 + 1]! * 2 - 1;
      const projected = u * directionX + v * directionY;
      const thread = 0.5 + Math.sin(projected * scale * detail * 48 * TAU) * 0.5;
      const crossing = readScalar(context.fiberCrossing, pixel);
      const angle = Math.atan2(directionY, directionX);
      return {
        ...base,
        baseColor: mixColor(shade(color, 0.52 + thread * 0.36), accentColor, crossing * 0.22),
        height: clamp01(0.47 + thread * 0.025 + crossing * 0.018),
        roughness: clamp01(roughness + crossing * 0.16),
        anisotropy: readScalar(context.fiberAnisotropy, pixel, 0.75),
        anisotropyRotation: fract(angle / TAU + 1),
        sheen: clamp01(0.7 + amount * 0.3),
        sheenColor: mixColor(color, accentColor, 0.36 + crossing * 0.3),
      };
    }
    case "nacreFilm": {
      const film = readColor(context.filmColor, pixel, accentColor);
      const ridge = 1 - smoothstep(0.06, 0.2, context.cells(u * 0.72, v * 0.72));
      return {
        ...base,
        baseColor: mixColor(shade(color, 0.8 + broad * 0.2), film, 0.46 + ridge * 0.24),
        height: clamp01(0.48 + ridge * 0.04 + fine * 0.018),
        roughness: clamp01(roughness + ridge * 0.08),
        clearcoat: 0.92,
        clearcoatRoughness: 0.06,
        iridescence: clamp01(0.72 + amount * 0.28),
        iridescenceThickness: readScalar(context.thickness, pixel, 0.5),
      };
    }
    case "patinatedCopper": {
      const reaction = readScalar(context.reaction, pixel);
      const wet = readScalar(context.moisture, pixel);
      const patina = smoothstep(0.28, 0.72, reaction * 0.68 + wet * 0.5) * amount;
      const copper = shade(color, 0.72 + broad * 0.28);
      return {
        ...base,
        baseColor: mixColor(copper, accentColor, patina),
        height: clamp01(0.43 + broad * 0.08 + reaction * 0.055 + patina * 0.035),
        metallic: clamp01(1 - patina * 0.86),
        roughness: clamp01(roughness + patina * 0.42 + readScalar(context.salt, pixel) * 0.16),
        ao: clamp01(0.92 - patina * 0.16),
      };
    }
    case "crackleGlaze": {
      const crack = readScalar(context.crack, pixel);
      const lift = readScalar(context.crackLift, pixel);
      const mottling = readScalar(context.reaction, pixel);
      return {
        ...base,
        baseColor: mixColor(mixColor(color, accentColor, mottling * 0.3), shade(accentColor, 0.3), crack),
        height: clamp01(0.48 + broad * 0.025 + lift * 0.06 - crack * 0.16),
        roughness: clamp01(roughness + crack * 0.5 - lift * 0.1),
        ao: clamp01(1 - crack * 0.42),
        clearcoat: clamp01((1 - crack) * (0.72 + amount * 0.28)),
        clearcoatRoughness: clamp01(0.05 + mottling * 0.12 + crack * 0.48),
      };
    }
    case "charredWood": {
      const crack = readScalar(context.crack, pixel);
      const hierarchy = readScalar(context.crackHierarchy, pixel);
      const directionX = context.fiberDirection?.data[pixel * 2]! * 2 - 1;
      const directionY = context.fiberDirection?.data[pixel * 2 + 1]! * 2 - 1;
      const grain = 0.5 + Math.sin((u * directionX + v * directionY) * scale * detail * 12 * TAU + broad * 2) * 0.5;
      const ash = smoothstep(0.72, 0.92, fine) * amount;
      const char = clamp01(amount * (0.58 + hierarchy * 0.42));
      return {
        ...base,
        baseColor: mixColor(mixColor(color, [0.018, 0.014, 0.012], char), accentColor, ash * 0.56),
        height: clamp01(0.38 + grain * 0.09 - crack * 0.24 + ash * 0.035),
        roughness: clamp01(roughness + char * 0.18 + ash * 0.12),
        ao: clamp01(0.9 - crack * 0.48),
        anisotropy: readScalar(context.fiberAnisotropy, pixel, 0.62) * (1 - ash * 0.4),
        anisotropyRotation: fract(Math.atan2(directionY, directionX) / TAU + 1),
      };
    }
    case "tidalBeach": {
      const wet = readScalar(context.moisture, pixel);
      const salt = readScalar(context.salt, pixel);
      const ripple = 0.5 + Math.sin((v * scale * 2.6 + broad * 0.5) * TAU) * 0.5;
      const shell = smoothstep(0.22, 0.055, context.cells(u * 1.7, v * 1.7));
      const foam = smoothstep(0.58, 0.82, salt * 0.6 + ripple * wet * 0.55);
      return {
        ...base,
        baseColor: mixColor(mixColor(color, shade(color, 0.38), wet), accentColor, shell * 0.58 + foam * 0.42),
        height: clamp01(0.36 + ripple * 0.12 + shell * 0.14 - wet * 0.035),
        roughness: clamp01(roughness - wet * 0.62 + foam * 0.28),
        ao: clamp01(0.86 + ripple * 0.14),
        transmission: wet * 0.05,
        clearcoat: wet * 0.5,
        clearcoatRoughness: clamp01(0.05 + foam * 0.42),
      };
    }
    case "biologicalColony": {
      const reaction = readScalar(context.reaction, pixel);
      const membrane = smoothstep(0.28, 0.72, reaction);
      const cells = smoothstep(0.24, 0.06, context.cells(u * 1.3, v * 1.3));
      const network = 1 - smoothstep(0.018, 0.075, context.ridges(u, v));
      const vein = clamp01(membrane * 0.55 + cells * 0.25 + network * 0.52);
      return {
        ...base,
        baseColor: mixColor(shade(color, 0.62 + reaction * 0.42), accentColor, vein),
        height: clamp01(0.34 + membrane * 0.19 + cells * 0.1 + network * 0.12 + fine * 0.025),
        roughness: clamp01(roughness - membrane * 0.22 + cells * 0.12),
        transmission: clamp01(0.08 + membrane * amount * 0.24),
        sheen: membrane * 0.42,
        sheenColor: accentColor,
        thickness: readScalar(context.thickness, pixel, 0.5) * (0.55 + membrane * 0.45),
        subsurface: clamp01(0.48 + membrane * amount * 0.5),
      };
    }
    case "weatheredWall": {
      const wet = readScalar(context.moisture, pixel);
      const salt = readScalar(context.salt, pixel);
      const mold = readScalar(context.mold, pixel);
      const peel = readScalar(context.peel, pixel) * amount;
      const crack = readScalar(context.crack, pixel);
      const undercoat = mixColor(accentColor, [0.2, 0.18, 0.14], wet * 0.6);
      return {
        ...base,
        baseColor: mixColor(mixColor(mixColor(color, undercoat, peel), [0.72, 0.7, 0.58], salt), [0.055, 0.12, 0.045], mold),
        height: clamp01(0.44 + broad * 0.07 - peel * 0.13 + salt * 0.035 - crack * 0.17),
        roughness: clamp01(roughness - wet * 0.24 + salt * 0.1 + mold * 0.08),
        ao: clamp01(0.96 - crack * 0.38 - peel * 0.16),
      };
    }
  }
}

export function buildFourthBatchMaterial(
  definition: FourthBatchMaterialDefinition,
  size: number,
  params: FourthBatchMaterialParams = {},
): LayeredMaterial {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  const { context, height } = prepareContext(definition, size, params);
  const baseColor = makeTexture(size, size, 3);
  const metallic = makeTexture(size, size, 1);
  const roughness = makeTexture(size, size, 1);
  const ao = makeTexture(size, size, 1);
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
      const materialSample = sampleMaterial(context, u, v, x, y, pixel);
      writeColor(baseColor, pixel, materialSample.baseColor);
      height.data[pixel] = clamp01(materialSample.height);
      metallic.data[pixel] = clamp01(materialSample.metallic);
      roughness.data[pixel] = clamp(materialSample.roughness, 0.04, 1);
      ao.data[pixel] = clamp01(materialSample.ao);
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
  const physical: ExtendedMaterialPhysical = {
    ior: definition.physical.ior,
    thickness: definition.physical.thickness,
    emissiveIntensity: definition.physical.emissiveIntensity,
    alphaCutoff: definition.physical.alphaCutoff,
  };
  const extended = assembleExtendedMaterial(
    { baseColor, metallic, roughness, normal: heightToNormal(height, definition.normalStrength), ao, height, emission },
    { opacity, transmission, anisotropy, anisotropyRotation, physical },
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

export const FOURTH_BATCH_MATERIAL_DEFINITIONS = {
  layeredAutomotivePaint: { label: "多层汽车漆", focus: "金属底、色漆、清漆、橘皮与多层高光", kind: "automotivePaint", seed: 401, scale: 7, detail: 6, amount: 0.82, color: [0.42, 0.012, 0.018], accentColor: [0.95, 0.28, 0.08], roughness: 0.18, normalStrength: 3, physical: { ...physicalBase, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.25 } },
  translucentJadeWax: { label: "透光玉石与蜡", focus: "厚度、吸收、次表面散射与内部云雾", kind: "jadeWax", seed: 402, scale: 5, detail: 5, amount: 0.78, color: [0.32, 0.72, 0.48], accentColor: [0.86, 0.92, 0.66], roughness: 0.28, normalStrength: 2, physical: { ...physicalBase, ior: 1.46, thickness: 0.9, subsurface: 1, attenuationDistance: 0.72, attenuationColor: [0.34, 0.82, 0.5] } },
  directionalVelvetSilk: { label: "天鹅绒与丝绸", focus: "纤维张量、Sheen、掠射高光与经纬交织", kind: "velvetSilk", seed: 403, scale: 9, detail: 6, amount: 0.86, color: [0.19, 0.015, 0.16], accentColor: [0.72, 0.18, 0.62], roughness: 0.5, normalStrength: 5, physical: { ...physicalBase, ior: 1.48, sheen: 1, sheenRoughness: 0.32 } },
  nacreOilFilm: { label: "珠母与油膜", focus: "薄膜干涉、视角色变与彩虹高光", kind: "nacreFilm", seed: 404, scale: 6, detail: 5, amount: 0.94, color: [0.68, 0.72, 0.76], accentColor: [0.9, 0.46, 0.72], roughness: 0.16, normalStrength: 3, physical: { ...physicalBase, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 1, iridescenceIor: 1.52 } },
  reactionPatinatedCopper: { label: "反应铜锈", focus: "反应扩散、潮湿传播与金属化学分层", kind: "patinatedCopper", seed: 405, scale: 7, detail: 5, amount: 0.78, color: [0.55, 0.18, 0.055], accentColor: [0.035, 0.42, 0.32], roughness: 0.28, normalStrength: 5, physical: physicalBase },
  crackleCeramicGlaze: { label: "陶瓷裂纹釉", focus: "分叉收缩裂纹、釉层厚度、翘边与积污", kind: "crackleGlaze", seed: 406, scale: 8, detail: 5, amount: 0.82, color: [0.72, 0.78, 0.68], accentColor: [0.12, 0.18, 0.16], roughness: 0.24, normalStrength: 5, physical: { ...physicalBase, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.08 } },
  thermallyCharredWood: { label: "热解烧焦木材", focus: "热影响区、炭化、灰烬、纵向裂解", kind: "charredWood", seed: 407, scale: 8, detail: 6, amount: 0.84, color: [0.24, 0.095, 0.025], accentColor: [0.45, 0.43, 0.39], roughness: 0.78, normalStrength: 7, physical: physicalBase },
  tidalBeachSediment: { label: "潮汐沙滩", focus: "水波纹、湿线、盐霜泡沫与贝壳分布", kind: "tidalBeach", seed: 408, scale: 8, detail: 5, amount: 0.74, color: [0.58, 0.39, 0.19], accentColor: [0.86, 0.79, 0.61], roughness: 0.84, normalStrength: 6, physical: { ...physicalBase, ior: 1.33, clearcoat: 0.5 } },
  competitiveBiologicalColony: { label: "竞争生物菌落", focus: "反应扩散、细胞竞争、膜层与脉络网络", kind: "biologicalColony", seed: 409, scale: 7, detail: 5, amount: 0.8, color: [0.24, 0.055, 0.19], accentColor: [0.62, 0.74, 0.18], roughness: 0.48, normalStrength: 5, physical: { ...physicalBase, ior: 1.41, thickness: 0.18, sheen: 0.45, subsurface: 0.92, attenuationDistance: 0.36, attenuationColor: [0.55, 0.22, 0.44] } },
  ancientWeatheredWall: { label: "古建筑风化墙", focus: "渗水、盐析、霉菌、剥落与多年风化", kind: "weatheredWall", seed: 410, scale: 8, detail: 5, amount: 0.76, color: [0.58, 0.44, 0.29], accentColor: [0.28, 0.16, 0.09], roughness: 0.86, normalStrength: 7, physical: physicalBase },
} satisfies Record<string, FourthBatchMaterialDefinition>;

export type FourthBatchMaterialName = keyof typeof FOURTH_BATCH_MATERIAL_DEFINITIONS;

function builder(name: FourthBatchMaterialName) {
  return (size: number, params: FourthBatchMaterialParams = {}) => (
    buildFourthBatchMaterial(FOURTH_BATCH_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const FOURTH_BATCH_MATERIALS = {
  layeredAutomotivePaint: builder("layeredAutomotivePaint"),
  translucentJadeWax: builder("translucentJadeWax"),
  directionalVelvetSilk: builder("directionalVelvetSilk"),
  nacreOilFilm: builder("nacreOilFilm"),
  reactionPatinatedCopper: builder("reactionPatinatedCopper"),
  crackleCeramicGlaze: builder("crackleCeramicGlaze"),
  thermallyCharredWood: builder("thermallyCharredWood"),
  tidalBeachSediment: builder("tidalBeachSediment"),
  competitiveBiologicalColony: builder("competitiveBiologicalColony"),
  ancientWeatheredWall: builder("ancientWeatheredWall"),
};

export const FOURTH_BATCH_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(FOURTH_BATCH_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "尺度", type: "range", min: 1, max: 20, step: 0.1, default: definition.scale },
    { key: "detail", label: "细节", type: "range", min: 1, max: 10, step: 0.1, default: definition.detail },
    { key: "amount", label: "机制强度", type: "range", min: 0, max: 1, step: 0.01, default: definition.amount },
    { key: "color", label: "主色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "辅色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies FourthBatchMaterialParamSpec[]]),
) as Record<FourthBatchMaterialName, FourthBatchMaterialParamSpec[]>;

export function defaultFourthBatchMaterialParams(name: FourthBatchMaterialName): FourthBatchMaterialParams {
  const params: FourthBatchMaterialParams = {};
  for (const spec of FOURTH_BATCH_MATERIAL_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}
