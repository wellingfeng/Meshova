import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import {
  createSciFiHullHeightSystem,
  type SciFiHullHeightRecipe,
  type SciFiHullHeightSystemParams,
  type SciFiHullMasks,
} from "./sci-fi-hull.js";
import { heightToNormal, type Material, type MaterialFields } from "./pbr.js";
import type { ScalarField2D } from "./shape-grammar.js";

export interface SciFiHullMaterialSystemParams extends SciFiHullHeightSystemParams {
  paintCoverage?: number;
  edgeWear?: number;
  scratchDensity?: number;
  scratchDirection?: number;
  scratchScale?: number;
  rust?: number;
  oil?: number;
  dust?: number;
  rain?: number;
  emissionGlow?: number;
  paintColor?: [number, number, number];
  accentPaintColor?: [number, number, number];
  bareMetalColor?: [number, number, number];
  rustColor?: [number, number, number];
  dustColor?: [number, number, number];
}

export const SCI_FI_HULL_MATERIAL_MASK_NAMES = [
  "paintable",
  "paint",
  "accentPaint",
  "exposedMetal",
  "edgeWear",
  "scratches",
  "dust",
  "rust",
  "oil",
  "rainStreaks",
  "emissionCore",
  "emissionGlow",
  "materialGroup",
] as const;

export type SciFiHullMaterialMaskName = typeof SCI_FI_HULL_MATERIAL_MASK_NAMES[number];
export type SciFiHullMaterialMasks = Readonly<Record<SciFiHullMaterialMaskName, ScalarField2D>>;

export interface SciFiHullMaterialPixel {
  readonly baseColor: [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly ao: number;
  readonly height: number;
  readonly emission: [number, number, number];
  readonly masks: Readonly<Record<SciFiHullMaterialMaskName, number>>;
}

export interface SciFiHullMaterialRecipe {
  readonly fields: MaterialFields;
  readonly masks: SciFiHullMaterialMasks;
  readonly hull: SciFiHullHeightRecipe;
  readonly sample: (u: number, v: number) => SciFiHullMaterialPixel;
}

export interface SciFiHullMaterialBake {
  readonly material: Material;
  readonly masks: Readonly<Record<SciFiHullMaterialMaskName, TextureBuffer>>;
  readonly hullMasks: SciFiHullMasks;
  readonly hull: SciFiHullHeightRecipe;
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

function hash01(x: number, y: number, seed: number, salt = 0): number {
  let hash = Math.imul(x, 0x1f123bb5)
    ^ Math.imul(y, 0x5f356495)
    ^ Math.imul(seed, 0x2c9277b5)
    ^ Math.imul(salt, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 0xffffffff;
}

function periodicNoise(u: number, v: number, seed: number, frequency: number): number {
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < 3; octave++) {
    const scale = Math.max(1, Math.round(frequency * 2 ** octave));
    const xFrequency = scale + 1 + Math.floor(hash01(octave, 1, seed, 11) * 3);
    const yFrequency = scale + 1 + Math.floor(hash01(octave, 2, seed, 17) * 3);
    const phase = hash01(octave, 3, seed, 23) * TAU;
    const amplitude = 1 / 2 ** octave;
    sum += Math.sin((u * xFrequency + v * yFrequency) * TAU + phase) * amplitude;
    sum += Math.cos((u * yFrequency - v * xFrequency) * TAU + phase * 0.73) * amplitude * 0.5;
    weight += amplitude * 1.5;
  }
  return clamp(sum / Math.max(weight, 1e-6) * 0.5 + 0.5, 0, 1);
}

function mixColor(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  const weight = clamp(amount, 0, 1);
  return [
    clamp(left[0] + (right[0] - left[0]) * weight, 0, 1),
    clamp(left[1] + (right[1] - left[1]) * weight, 0, 1),
    clamp(left[2] + (right[2] - left[2]) * weight, 0, 1),
  ];
}

function maskEdge(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamp(4 * clamped * (1 - clamped), 0, 1);
}

function maxMask(masks: SciFiHullMasks, names: readonly (keyof SciFiHullMasks)[], u: number, v: number): number {
  let value = 0;
  for (const name of names) value = Math.max(value, masks[name](u, v));
  return value;
}

function dilateField(field: ScalarField2D, u: number, v: number, radius: number): number {
  let value = field(u, v);
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * TAU;
    value = Math.max(value, field(wrap01(u + Math.cos(angle) * radius), wrap01(v + Math.sin(angle) * radius)));
  }
  return value;
}

function memoizeField(field: ScalarField2D): ScalarField2D {
  let previousU = Number.NaN;
  let previousV = Number.NaN;
  let previousValue = 0;
  return (u, v) => {
    if (u === previousU && v === previousV) return previousValue;
    previousU = u;
    previousV = v;
    previousValue = field(u, v);
    return previousValue;
  };
}

/** P5 reconstruction: semantic paint, exposure, weathering, leaks, and emission. */
export function createSciFiHullMaterialSystem(
  params: SciFiHullMaterialSystemParams = {},
): SciFiHullMaterialRecipe {
  const seed = Math.floor(params.seed ?? 733);
  const paintCoverage = clamp(params.paintCoverage ?? 0.88, 0, 1);
  const edgeWearAmount = clamp(params.edgeWear ?? 0.58, 0, 1);
  const scratchDensity = clamp(params.scratchDensity ?? 0.42, 0, 1);
  const scratchDirection = (params.scratchDirection ?? 8) * Math.PI / 180;
  const scratchScale = Math.max(8, params.scratchScale ?? 54);
  const rustAmount = clamp(params.rust ?? 0.46, 0, 1);
  const oilAmount = clamp(params.oil ?? 0.34, 0, 1);
  const dustAmount = clamp(params.dust ?? 0.4, 0, 1);
  const rainAmount = clamp(params.rain ?? 0.3, 0, 1);
  const emissionGlowAmount = clamp(params.emissionGlow ?? 0.48, 0, 1);
  const paintColor = params.paintColor ?? [0.055, 0.11, 0.14];
  const accentPaintColor = params.accentPaintColor ?? [0.12, 0.34, 0.42];
  const bareMetalColor = params.bareMetalColor ?? [0.34, 0.38, 0.4];
  const rustColor = params.rustColor ?? [0.42, 0.12, 0.025];
  const dustColor = params.dustColor ?? [0.18, 0.14, 0.095];
  const emissionColor = params.emissionColor ?? [0.02, 0.72, 0.92];
  const hull = createSciFiHullHeightSystem(params);
  const source = Object.fromEntries(
    Object.entries(hull.masks).map(([name, field]) => [name, memoizeField(field)]),
  ) as unknown as SciFiHullMasks;

  const paintable = memoizeField((u, v) => {
    const excluded = maxMask(source, ["cavities", "cutouts", "emission", "circuits"], u, v);
    const utilityMetal = Math.max(source.pipes(u, v), source.fasteners(u, v) * 0.8);
    return clamp(source.panels(u, v) * (1 - excluded) * (1 - utilityMetal * 0.9), 0, 1);
  });

  const materialGroup = memoizeField((u, v) => {
    const component = source.componentId(u, v);
    const cover = source.coverPlates(u, v);
    const controls = source.controls(u, v);
    return clamp(Math.max(controls, cover * 0.72, smoothstep(0.27, 0.36, component) * 0.55), 0, 1);
  });

  const edgeSource = memoizeField((u, v) => {
    const semanticEdge = Math.max(source.edges(u, v), source.seams(u, v) * 0.42);
    const mechanicalEdge = Math.max(
      maskEdge(source.occupancy(u, v)),
      maskEdge(source.hatches(u, v)),
      maskEdge(source.turbines(u, v)),
      maskEdge(source.rectangularVents(u, v)),
      maskEdge(source.circularVents(u, v)),
    );
    return clamp(Math.max(semanticEdge, mechanicalEdge), 0, 1);
  });

  const edgeWear = memoizeField((u, v) => {
    const breakup = periodicNoise(u, v, seed + 101, 7);
    return clamp(edgeSource(u, v) * smoothstep(0.22, 0.78, breakup) * edgeWearAmount, 0, 1);
  });

  const scratches = memoizeField((u, v) => {
    if (scratchDensity <= 0) return 0;
    const normalX = -Math.sin(scratchDirection);
    const normalY = Math.cos(scratchDirection);
    const xFrequency = Math.round(normalX * scratchScale) || 1;
    const yFrequency = Math.round(normalY * scratchScale) || 1;
    const phase = (u * xFrequency + v * yFrequency) * TAU + hash01(1, 2, seed, 307) * TAU;
    const line = smoothstep(0.965, 0.998, Math.cos(phase));
    const gate = smoothstep(0.54 + (1 - scratchDensity) * 0.28, 0.88, periodicNoise(u, v, seed + 211, 5));
    const contact = clamp(0.35 + edgeSource(u, v) * 0.65, 0, 1);
    return clamp(line * gate * contact * scratchDensity, 0, 1);
  });

  const exposedMetal = memoizeField((u, v) => clamp(
    paintable(u, v) * Math.max(edgeWear(u, v), scratches(u, v)),
    0,
    1,
  ));

  const rainStreaks = memoizeField((u, v) => {
    if (rainAmount <= 0) return 0;
    const warp = (periodicNoise(u, v, seed + 401, 3) - 0.5) * 0.018;
    const lineSignal = Math.cos((u + warp) * TAU * 31) * 0.5 + 0.5;
    const thread = smoothstep(0.82, 0.97, lineSignal)
      * smoothstep(0.32, 0.7, periodicNoise(u, v, seed + 409, 7));
    let obstacle = 0;
    for (let step = 1; step <= 6; step++) {
      const offset = step * 0.028;
      const wiggle = (periodicNoise(u, v + offset, seed + 419, 4) - 0.5) * 0.008;
      obstacle = Math.max(obstacle, source.occupancy(wrap01(u + wiggle), wrap01(v + offset)) * (1 - step / 8));
    }
    return clamp(thread * obstacle * rainAmount, 0, 1);
  });

  const dust = memoizeField((u, v) => {
    const cavity = Math.max(source.seams(u, v), source.cavities(u, v), source.rectangularVents(u, v) * 0.55);
    const breakup = 0.28 + periodicNoise(u, v, seed + 503, 9) * 0.72;
    return clamp(cavity * breakup * dustAmount * (1 - rainStreaks(u, v) * 0.5), 0, 1);
  });

  const rust = memoizeField((u, v) => {
    const origin = Math.max(
      exposedMetal(u, v) * 0.95,
      source.seams(u, v) * 0.68,
      source.fasteners(u, v) * 0.9,
      rainStreaks(u, v) * 0.46,
    );
    const breakup = smoothstep(0.25, 0.78, periodicNoise(u, v, seed + 601, 8));
    const spread = smoothstep(0.58, 0.82, periodicNoise(u, v, seed + 607, 3)) * exposedMetal(u, v) * 0.45;
    return clamp(Math.max(origin * (0.38 + breakup * 0.62), spread) * rustAmount, 0, 1);
  });

  const oil = memoizeField((u, v) => {
    if (oilAmount <= 0) return 0;
    const leakSource = (sampleU: number, sampleV: number) => Math.max(
      maskEdge(source.connectors(sampleU, sampleV)),
      maskEdge(source.turbines(sampleU, sampleV)) * 0.72,
      maskEdge(source.rectangularVents(sampleU, sampleV)) * 0.5,
      maskEdge(source.circularVents(sampleU, sampleV)) * 0.5,
    );
    const drip = (
      originU: number,
      originV: number,
      width: number,
      length: number,
      salt: number,
    ) => {
      const downwardDistance = wrap01(originV - v);
      const vertical = (1 - smoothstep(length * 0.35, length, downwardDistance))
        * smoothstep(0, 0.012, downwardDistance);
      const center = wrap01(originU + (periodicNoise(u, v, seed + salt, 3) - 0.5) * width * 0.8);
      const horizontalDistance = Math.min(Math.abs(u - center), 1 - Math.abs(u - center));
      return (1 - smoothstep(width * 0.35, width, horizontalDistance)) * vertical;
    };
    const trail = Math.max(
      leakSource(u, v),
      drip(0.5, 0.52, 0.018, 0.16, 701),
      drip(0.73, 0.56, 0.026, 0.22, 709),
      drip(0.74, 0.18, 0.02, 0.14, 719),
      drip(0.49, 0.18, 0.016, 0.13, 727),
    );
    const breakup = 0.42 + periodicNoise(u, v, seed + 709, 11) * 0.58;
    return clamp(trail * breakup * oilAmount, 0, 1);
  });

  const emissionCore = memoizeField((u, v) => source.emission(u, v));
  const emissionGlow = memoizeField((u, v) => {
    const expanded = dilateField(emissionCore, u, v, 0.012 + emissionGlowAmount * 0.016);
    return clamp(Math.max(0, expanded - emissionCore(u, v) * 0.35) * emissionGlowAmount, 0, 1);
  });

  const paint = memoizeField((u, v) => clamp(
    paintable(u, v) * paintCoverage * (1 - exposedMetal(u, v)) * (1 - rust(u, v)),
    0,
    1,
  ));
  const accentPaint = memoizeField((u, v) => paint(u, v) * materialGroup(u, v));

  const masks: SciFiHullMaterialMasks = {
    paintable,
    paint,
    accentPaint,
    exposedMetal,
    edgeWear,
    scratches,
    dust,
    rust,
    oil,
    rainStreaks,
    emissionCore,
    emissionGlow,
    materialGroup,
  };

  const evaluate = (u: number, v: number): SciFiHullMaterialPixel => {
    const sampledMasks = Object.fromEntries(
      SCI_FI_HULL_MATERIAL_MASK_NAMES.map((name) => [name, masks[name](u, v)]),
    ) as Record<SciFiHullMaterialMaskName, number>;
    const primaryPaint = sampledMasks.paint * (1 - sampledMasks.accentPaint);
    let color = mixColor(bareMetalColor, paintColor, primaryPaint);
    color = mixColor(color, accentPaintColor, sampledMasks.accentPaint);
    color = mixColor(color, [0.55, 0.58, 0.59], sampledMasks.exposedMetal * 0.72);
    color = mixColor(color, rustColor, sampledMasks.rust * 0.95);
    color = mixColor(color, dustColor, sampledMasks.dust * 0.78);
    color = mixColor(color, [0.015, 0.012, 0.01], sampledMasks.oil * 0.58);
    color = mixColor(color, emissionColor, sampledMasks.emissionCore * 0.52 + sampledMasks.emissionGlow * 0.18);
    const dielectricCover = clamp(
      sampledMasks.paint * 1.18 + sampledMasks.rust + sampledMasks.dust + sampledMasks.oil,
      0,
      1,
    );
    let roughness = 0.27 + sampledMasks.paint * 0.2;
    roughness -= sampledMasks.exposedMetal * 0.13;
    roughness += sampledMasks.rust * 0.52 + sampledMasks.dust * 0.48;
    roughness -= sampledMasks.oil * 0.3 + sampledMasks.rainStreaks * 0.08;
    return {
      baseColor: color,
      metallic: clamp(0.96 * (1 - dielectricCover), 0, 1),
      roughness: clamp(roughness, 0.04, 1),
      ao: clamp(hull.fields.ao!(u, v) - sampledMasks.dust * 0.12 - sampledMasks.rust * 0.07, 0, 1),
      height: clamp(hull.fields.height!(u, v) + sampledMasks.rust * 0.012 + sampledMasks.dust * 0.005 - sampledMasks.scratches * 0.008, 0, 1),
      emission: [
        emissionColor[0] * (sampledMasks.emissionCore + sampledMasks.emissionGlow * 0.24),
        emissionColor[1] * (sampledMasks.emissionCore + sampledMasks.emissionGlow * 0.24),
        emissionColor[2] * (sampledMasks.emissionCore + sampledMasks.emissionGlow * 0.24),
      ],
      masks: sampledMasks,
    };
  };

  return {
    hull,
    masks,
    sample: evaluate,
    fields: {
      baseColor: (u, v) => evaluate(u, v).baseColor,
      metallic: (u, v) => evaluate(u, v).metallic,
      roughness: (u, v) => evaluate(u, v).roughness,
      ao: (u, v) => evaluate(u, v).ao,
      height: (u, v) => evaluate(u, v).height,
      emission: (u, v) => evaluate(u, v).emission,
      normalStrength: params.normalStrength ?? 7,
      tileable: true,
    },
  };
}

/** Bake smart hull PBR and material-state masks in one deterministic pass. */
export function bakeSciFiHullMaterialSystem(
  size: number,
  params: SciFiHullMaterialSystemParams = {},
): SciFiHullMaterialBake {
  const resolution = Math.max(16, Math.floor(size));
  const recipe = createSciFiHullMaterialSystem(params);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks = Object.fromEntries(SCI_FI_HULL_MATERIAL_MASK_NAMES.map((name) => [
    name,
    makeTexture(resolution, resolution, 1),
  ])) as Record<SciFiHullMaterialMaskName, TextureBuffer>;

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const result = recipe.sample(u, v);
      baseColor.data[pixel * 3] = result.baseColor[0];
      baseColor.data[pixel * 3 + 1] = result.baseColor[1];
      baseColor.data[pixel * 3 + 2] = result.baseColor[2];
      metallic.data[pixel] = result.metallic;
      roughness.data[pixel] = result.roughness;
      ao.data[pixel] = result.ao;
      height.data[pixel] = result.height;
      emission.data[pixel * 3] = result.emission[0];
      emission.data[pixel * 3 + 1] = result.emission[1];
      emission.data[pixel * 3 + 2] = result.emission[2];
      for (const name of SCI_FI_HULL_MATERIAL_MASK_NAMES) masks[name].data[pixel] = result.masks[name];
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      ao,
      height,
      emission,
      normal: heightToNormal(height, params.normalStrength ?? 7, true),
    },
    masks,
    hullMasks: recipe.hull.masks,
    hull: recipe.hull,
  };
}

/** Size-aware builder used by Viewer and material registry. */
export function sciFiHullMaterialSystem(
  size: number,
  params: SciFiHullMaterialSystemParams = {},
): Material {
  return bakeSciFiHullMaterialSystem(size, params).material;
}
