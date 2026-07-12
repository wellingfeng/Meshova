import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import {
  heightToNormal,
  type Material,
  type MaterialFields,
} from "./pbr.js";

export interface StylizedCellRockParams {
  seed?: number;
  cells?: number;
  jitter?: number;
  heightLevels?: number;
  crackWidth?: number;
  crackDepth?: number;
  bevel?: number;
  distortion?: number;
  damage?: number;
  moss?: number;
  topMoss?: number;
  microDetail?: number;
  rockPalette?: readonly [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  mossColor?: [number, number, number];
  normalStrength?: number;
}

export interface StylizedCellRockMasks {
  cells: (u: number, v: number) => number;
  cracks: (u: number, v: number) => number;
  edges: (u: number, v: number) => number;
  damagedEdges: (u: number, v: number) => number;
  topFaces: (u: number, v: number) => number;
  creviceMoss: (u: number, v: number) => number;
  topMoss: (u: number, v: number) => number;
  moss: (u: number, v: number) => number;
  microGrains: (u: number, v: number) => number;
  componentId: (u: number, v: number) => number;
}

export type StylizedCellRockMaskName = keyof StylizedCellRockMasks;

export interface StylizedCellRockRecipe {
  readonly fields: MaterialFields;
  readonly masks: StylizedCellRockMasks;
  readonly sample: (u: number, v: number) => StylizedCellRockPixel;
}

export interface StylizedCellRockBake {
  readonly material: Material;
  readonly masks: Readonly<Record<StylizedCellRockMaskName, TextureBuffer>>;
}

interface CellSample {
  nearest: number;
  borderGap: number;
  localX: number;
  localY: number;
  random: number;
  random2: number;
  random3: number;
  componentId: number;
}

export interface StylizedCellRockPixel {
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  ao: number;
  height: number;
  emission: [number, number, number];
  masks: Record<StylizedCellRockMaskName, number>;
}

const DEFAULT_ROCK_PALETTE = [
  [0.16, 0.18, 0.17],
  [0.24, 0.27, 0.25],
  [0.34, 0.37, 0.34],
  [0.45, 0.47, 0.42],
] as const;

function wrap01(value: number): number {
  return value - Math.floor(value);
}

function wrapInt(value: number, period: number): number {
  return ((value % period) + period) % period;
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

/** Small periodic signal used for seamless domain warp and surface breakup. */
function periodicNoise(u: number, v: number, seed: number, frequency: number): number {
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < 3; octave++) {
    const f = Math.max(1, Math.round(frequency * 2 ** octave));
    const kx = f + 1 + Math.floor(hash01(octave, 1, seed, 11) * 3);
    const ky = f + 1 + Math.floor(hash01(octave, 2, seed, 17) * 3);
    const phase = hash01(octave, 3, seed, 23) * TAU;
    const amplitude = 1 / 2 ** octave;
    sum += Math.sin((u * kx + v * ky) * TAU + phase) * amplitude;
    sum += Math.cos((u * ky - v * kx) * TAU + phase * 0.73) * amplitude * 0.5;
    weight += amplitude * 1.5;
  }
  return clamp(sum / Math.max(weight, 1e-6) * 0.5 + 0.5, 0, 1);
}

function samplePeriodicCell(
  u: number,
  v: number,
  cellsX: number,
  jitter: number,
  seed: number,
  distortion: number,
  cellsY = cellsX,
): CellSample {
  const warpScale = Math.max(1, Math.floor(Math.min(cellsX, cellsY) * 0.45));
  const warpedU = wrap01(u + (periodicNoise(u, v, seed + 101, warpScale) - 0.5) * distortion / cellsX);
  const warpedV = wrap01(v + (periodicNoise(u, v, seed + 211, warpScale) - 0.5) * distortion / cellsY);
  const px = warpedU * cellsX;
  const py = warpedV * cellsY;
  const baseX = Math.floor(px);
  const baseY = Math.floor(py);
  let nearest = Infinity;
  let second = Infinity;
  let nearestFeatureX = 0;
  let nearestFeatureY = 0;
  let nearestCellX = 0;
  let nearestCellY = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const rawX = baseX + ox;
      const rawY = baseY + oy;
      const cellX = wrapInt(rawX, cellsX);
      const cellY = wrapInt(rawY, cellsY);
      const featureX = rawX + 0.5 + (hash01(cellX, cellY, seed, 31) - 0.5) * jitter;
      const featureY = rawY + 0.5 + (hash01(cellX, cellY, seed, 47) - 0.5) * jitter;
      const distance = Math.hypot(px - featureX, py - featureY);
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
        nearestFeatureX = featureX;
        nearestFeatureY = featureY;
        nearestCellX = cellX;
        nearestCellY = cellY;
      } else if (distance < second) {
        second = distance;
      }
    }
  }

  return {
    nearest,
    borderGap: Math.max(0, second - nearest),
    localX: px - nearestFeatureX,
    localY: py - nearestFeatureY,
    random: hash01(nearestCellX, nearestCellY, seed, 71),
    random2: hash01(nearestCellX, nearestCellY, seed, 89),
    random3: hash01(nearestCellX, nearestCellY, seed, 107),
    componentId: hash01(nearestCellX, nearestCellY, seed, 131),
  };
}

function mixColor(
  first: [number, number, number],
  second: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = clamp(amount, 0, 1);
  return [
    clamp(first[0] + (second[0] - first[0]) * t, 0, 1),
    clamp(first[1] + (second[1] - first[1]) * t, 0, 1),
    clamp(first[2] + (second[2] - first[2]) * t, 0, 1),
  ];
}

function scaleColor(
  color: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    clamp(color[0] * amount, 0, 1),
    clamp(color[1] * amount, 0, 1),
    clamp(color[2] * amount, 0, 1),
  ];
}

/**
 * P7 reconstruction: periodic Voronoi blocks, quantized faces, beveled cracks,
 * selective edge damage, and two independent moss growth rules.
 */
export function createStylizedCellRockRecipe(
  params: StylizedCellRockParams = {},
): StylizedCellRockRecipe {
  const seed = Math.floor(params.seed ?? 307);
  const cells = Math.max(2, Math.floor(params.cells ?? 7));
  const jitter = clamp(params.jitter ?? 0.82, 0, 1);
  const levels = Math.max(2, Math.floor(params.heightLevels ?? 4));
  const crackWidth = clamp(params.crackWidth ?? 0.11, 0.025, 0.3);
  const crackDepth = clamp(params.crackDepth ?? 0.72, 0, 1);
  const bevel = clamp(params.bevel ?? 0.12, 0.02, 0.4);
  const distortion = clamp(params.distortion ?? 0.72, 0, 1.5);
  const damageAmount = clamp(params.damage ?? 0.38, 0, 1);
  const mossAmount = clamp(params.moss ?? 0.62, 0, 1);
  const topMossAmount = clamp(params.topMoss ?? 0.46, 0, 1);
  const microDetail = clamp(params.microDetail ?? 0.24, 0, 1);
  const palette = params.rockPalette ?? DEFAULT_ROCK_PALETTE;
  const mossColor = params.mossColor ?? [0.2, 0.36, 0.11];
  const normalStrength = Math.max(0, params.normalStrength ?? 7);

  const evaluate = (u: number, v: number): StylizedCellRockPixel => {
    const cell = samplePeriodicCell(u, v, cells, jitter, seed, distortion);
    const cracks = 1 - smoothstep(crackWidth * 0.42, crackWidth, cell.borderGap);
    const edges = 1 - smoothstep(crackWidth, crackWidth + bevel, cell.borderGap);
    const dome = smoothstep(0.03, 0.82, 1 - clamp(cell.nearest / 0.78, 0, 1));
    const angle = cell.random2 * TAU;
    const planar = clamp(
      0.5 + (cell.localX * Math.cos(angle) + cell.localY * Math.sin(angle)) * 0.52,
      0,
      1,
    );
    const heightBand = Math.round(cell.random * (levels - 1)) / (levels - 1);
    const damageNoise = periodicNoise(u, v, seed + 401, cells * 2);
    const damagedEdges = edges
      * (cell.random3 > 0.43 ? 1 : 0)
      * smoothstep(0.54, 0.82, damageNoise)
      * damageAmount;
    const microNoise = periodicNoise(u, v, seed + 503, cells * 8);
    const microGrains = smoothstep(0.72, 0.91, microNoise)
      * (1 - cracks)
      * microDetail;
    const topFaces = smoothstep(0.5, 0.82, heightBand * 0.68 + dome * 0.32)
      * smoothstep(0.2, 0.65, planar)
      * (1 - edges);
    const dampBreakup = periodicNoise(u, v, seed + 607, cells * 0.7);
    const creviceMoss = smoothstep(0.2, 0.76, cracks * 0.7 + edges * 0.3)
      * smoothstep(0.34, 0.72, dampBreakup)
      * mossAmount;
    const topMoss = topFaces
      * smoothstep(0.46, 0.76, periodicNoise(u, v, seed + 701, cells * 0.55))
      * topMossAmount
      * mossAmount;
    const moss = clamp(Math.max(creviceMoss, topMoss), 0, 1);
    const cellsMask = 1 - cracks;
    const baseHeight = 0.43 + heightBand * 0.28 + dome * 0.13 + (planar - 0.5) * 0.08;
    const height = clamp(
      baseHeight
        - cracks * crackDepth * 0.38
        - damagedEdges * 0.12
        + microGrains * 0.018
        + moss * 0.025,
      0,
      1,
    );

    const paletteIndex = Math.min(
      palette.length - 1,
      Math.floor(clamp(heightBand * 0.75 + planar * 0.25, 0, 0.9999) * palette.length),
    );
    const faceShade = 0.84 + planar * 0.18 + (cell.random2 - 0.5) * 0.07;
    let baseColor = scaleColor(palette[paletteIndex]!, faceShade);
    baseColor = mixColor(baseColor, [0.09, 0.105, 0.09], cracks * 0.72);
    baseColor = mixColor(baseColor, mossColor, moss * 0.9);
    baseColor = scaleColor(baseColor, 0.98 + microGrains * 0.08);

    return {
      baseColor,
      metallic: 0,
      roughness: clamp(0.78 + cracks * 0.1 + moss * 0.11 + microGrains * 0.04, 0.04, 1),
      ao: clamp(1 - cracks * 0.42 - edges * 0.1 - damagedEdges * 0.12, 0, 1),
      height,
      emission: [0, 0, 0],
      masks: {
        cells: cellsMask,
        cracks,
        edges,
        damagedEdges,
        topFaces,
        creviceMoss,
        topMoss,
        moss,
        microGrains,
        componentId: cell.componentId,
      },
    };
  };

  const mask = (name: StylizedCellRockMaskName) => (u: number, v: number) => evaluate(u, v).masks[name];
  return {
    sample: evaluate,
    fields: {
      baseColor: (u, v) => evaluate(u, v).baseColor,
      metallic: (u, v) => evaluate(u, v).metallic,
      roughness: (u, v) => evaluate(u, v).roughness,
      ao: (u, v) => evaluate(u, v).ao,
      height: (u, v) => evaluate(u, v).height,
      emission: (u, v) => evaluate(u, v).emission,
      normalStrength,
      tileable: true,
    },
    masks: {
      cells: mask("cells"),
      cracks: mask("cracks"),
      edges: mask("edges"),
      damagedEdges: mask("damagedEdges"),
      topFaces: mask("topFaces"),
      creviceMoss: mask("creviceMoss"),
      topMoss: mask("topMoss"),
      moss: mask("moss"),
      microGrains: mask("microGrains"),
      componentId: mask("componentId"),
    },
  };
}

/** Standard field-preset entry used by PRESETS and browser live baking. */
export function stylizedCellRock(params: StylizedCellRockParams = {}): MaterialFields {
  return createStylizedCellRockRecipe(params).fields;
}

/** Bake PBR plus named debug masks in one deterministic pass. */
export function bakeStylizedCellRock(
  size: number,
  params: StylizedCellRockParams = {},
): StylizedCellRockBake {
  const resolution = Math.max(16, Math.floor(size));
  const recipe = createStylizedCellRockRecipe(params);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const maskNames = Object.keys(recipe.masks) as StylizedCellRockMaskName[];
  const masks = Object.fromEntries(maskNames.map((name) => [
    name,
    makeTexture(resolution, resolution, 1),
  ])) as Record<StylizedCellRockMaskName, TextureBuffer>;

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const pixelSample = recipe.sample(u, v);
      const rgb = pixelSample.baseColor;
      baseColor.data[pixel * 3] = rgb[0];
      baseColor.data[pixel * 3 + 1] = rgb[1];
      baseColor.data[pixel * 3 + 2] = rgb[2];
      metallic.data[pixel] = pixelSample.metallic;
      roughness.data[pixel] = pixelSample.roughness;
      ao.data[pixel] = pixelSample.ao;
      height.data[pixel] = pixelSample.height;
      for (const name of maskNames) masks[name].data[pixel] = pixelSample.masks[name];
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
      normal: heightToNormal(height, recipe.fields.normalStrength ?? 2, true),
    },
    masks,
  };
}

export interface OrganicCellScalesParams {
  seed?: number;
  cells?: number;
  aspectRatio?: number;
  regularity?: number;
  roundness?: number;
  scaleVariation?: number;
  heightVariation?: number;
  slope?: number;
  crackWidth?: number;
  crackVariation?: number;
  edgeDamage?: number;
  deposition?: number;
  microDamage?: number;
  baseColor?: [number, number, number];
  accentColor?: [number, number, number];
  normalStrength?: number;
}

export interface OrganicCellScalesMasks {
  cells: (u: number, v: number) => number;
  cracks: (u: number, v: number) => number;
  edges: (u: number, v: number) => number;
  damagedEdges: (u: number, v: number) => number;
  deposition: (u: number, v: number) => number;
  highScales: (u: number, v: number) => number;
  slope: (u: number, v: number) => number;
  scratches: (u: number, v: number) => number;
  pits: (u: number, v: number) => number;
  microDamage: (u: number, v: number) => number;
  componentId: (u: number, v: number) => number;
}

export type OrganicCellScalesMaskName = keyof OrganicCellScalesMasks;

export interface OrganicCellScalesPixel {
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  ao: number;
  height: number;
  emission: [number, number, number];
  masks: Record<OrganicCellScalesMaskName, number>;
}

export interface OrganicCellScalesRecipe {
  readonly fields: MaterialFields;
  readonly masks: OrganicCellScalesMasks;
  readonly sample: (u: number, v: number) => OrganicCellScalesPixel;
}

export interface OrganicCellScalesBake {
  readonly material: Material;
  readonly masks: Readonly<Record<OrganicCellScalesMaskName, TextureBuffer>>;
}

/**
 * P2 reconstruction: rounded organic cells with stable per-component shape,
 * height, slope, color, edge damage, crevice deposits, and sparse micro wear.
 */
export function createOrganicCellScalesRecipe(
  params: OrganicCellScalesParams = {},
): OrganicCellScalesRecipe {
  const seed = Math.floor(params.seed ?? 419);
  const cellsX = Math.max(2, Math.floor(params.cells ?? 10));
  const aspectRatio = clamp(params.aspectRatio ?? 1.35, 0.5, 2.5);
  const cellsY = Math.max(2, Math.round(cellsX * aspectRatio));
  const regularity = clamp(params.regularity ?? 0.34, 0, 1);
  const jitter = 0.12 + (1 - regularity) * 0.82;
  const roundness = clamp(params.roundness ?? 0.68, 0, 1);
  const scaleVariation = clamp(params.scaleVariation ?? 0.3, 0, 0.65);
  const heightVariation = clamp(params.heightVariation ?? 0.42, 0, 1);
  const slopeAmount = clamp(params.slope ?? 0.48, 0, 1);
  const crackWidth = clamp(params.crackWidth ?? 0.085, 0.02, 0.24);
  const crackVariation = clamp(params.crackVariation ?? 0.5, 0, 1);
  const edgeDamageAmount = clamp(params.edgeDamage ?? 0.36, 0, 1);
  const depositionAmount = clamp(params.deposition ?? 0.52, 0, 1);
  const microDamageAmount = clamp(params.microDamage ?? 0.42, 0, 1);
  const baseColor = params.baseColor ?? [0.16, 0.27, 0.25];
  const accentColor = params.accentColor ?? [0.46, 0.62, 0.43];
  const normalStrength = Math.max(0, params.normalStrength ?? 8);

  const evaluate = (u: number, v: number): OrganicCellScalesPixel => {
    const cell = samplePeriodicCell(
      u,
      v,
      cellsX,
      jitter,
      seed,
      0.18 + (1 - regularity) * 0.32,
      cellsY,
    );
    const componentScale = 1 + (cell.random3 - 0.5) * scaleVariation * 1.5;
    const gapNoise = periodicNoise(u, v, seed + 401, cellsX * 1.7);
    const localCrackWidth = crackWidth * (
      0.72 + cell.random2 * crackVariation * 0.7 + gapNoise * crackVariation * 0.35
    );
    const scaledGap = cell.borderGap * componentScale;
    const baseCracks = 1 - smoothstep(localCrackWidth * 0.5, localCrackWidth, scaledGap);
    const branchNoise = periodicNoise(u, v, seed + 443, cellsX * 3.4);
    const branches = (1 - smoothstep(localCrackWidth, localCrackWidth * 2.1, scaledGap))
      * smoothstep(0.77, 0.91, branchNoise)
      * crackVariation;
    const cracks = clamp(Math.max(baseCracks, branches * 0.7), 0, 1);
    const edges = (1 - smoothstep(localCrackWidth, localCrackWidth + 0.15, scaledGap))
      * (1 - cracks * 0.35);
    const cells = 1 - cracks;

    const radius = clamp(cell.nearest / Math.max(0.38, 0.82 * componentScale), 0, 1);
    const roundedProfile = smoothstep(0, 1, 1 - radius);
    const flatProfile = smoothstep(localCrackWidth, localCrackWidth + 0.18, scaledGap);
    const profile = flatProfile + (roundedProfile - flatProfile) * roundness;
    const angle = cell.random2 * TAU;
    const localSlope = clamp(
      0.5 + (cell.localX * Math.cos(angle) + cell.localY * Math.sin(angle)) * 0.62,
      0,
      1,
    );
    const heightOffset = (cell.random - 0.5) * heightVariation * 0.34;
    const highScales = smoothstep(0.56, 0.82, cell.random * 0.72 + profile * 0.28) * cells;

    const damageNoise = periodicNoise(u, v, seed + 503, cellsX * 3.1);
    const damagedEdges = edges
      * (cell.random3 > 0.38 ? 1 : 0)
      * smoothstep(0.58, 0.84, damageNoise)
      * edgeDamageAmount;
    const depositBreakup = periodicNoise(u, v, seed + 607, cellsX * 0.8);
    const deposition = clamp(
      smoothstep(0.2, 0.86, cracks * 0.76 + edges * 0.24)
        * smoothstep(0.3, 0.76, depositBreakup)
        * depositionAmount,
      0,
      1,
    );

    const along = cell.localX * Math.cos(angle) + cell.localY * Math.sin(angle);
    const across = -cell.localX * Math.sin(angle) + cell.localY * Math.cos(angle);
    const scratchLine = 1 - smoothstep(0.015, 0.065, Math.abs(Math.sin((across * 1.7 + cell.random) * TAU)));
    const scratchLength = smoothstep(0.78, 0.18, Math.abs(along));
    const scratches = scratchLine
      * scratchLength
      * (cell.random2 > 0.48 ? 1 : 0)
      * (1 - edges)
      * microDamageAmount;
    const pitNoise = periodicNoise(u, v, seed + 709, cellsX * 7.5);
    const pits = smoothstep(0.82, 0.94, pitNoise)
      * (cell.random3 > 0.3 ? 1 : 0)
      * (1 - edges)
      * microDamageAmount;
    const microDamage = clamp(Math.max(scratches, pits), 0, 1);

    const height = clamp(
      0.46
        + heightOffset
        + profile * 0.23
        + (localSlope - 0.5) * slopeAmount * 0.13
        - cracks * 0.38
        - damagedEdges * 0.13
        - scratches * 0.035
        - pits * 0.055,
      0,
      1,
    );

    const componentTint = clamp(cell.random * 0.72 + cell.random2 * 0.28, 0, 1);
    let color = mixColor(baseColor, accentColor, componentTint * 0.72);
    color = scaleColor(color, 0.86 + localSlope * 0.18 + heightOffset * 0.3);
    color = mixColor(color, [0.055, 0.072, 0.058], cracks * 0.74 + deposition * 0.16);
    color = mixColor(color, [0.34, 0.31, 0.2], damagedEdges * 0.26 + microDamage * 0.12);

    return {
      baseColor: color,
      metallic: 0,
      roughness: clamp(0.66 + cracks * 0.15 + damagedEdges * 0.08 - deposition * 0.18 + pits * 0.06, 0.04, 1),
      ao: clamp(1 - cracks * 0.46 - deposition * 0.2 - damagedEdges * 0.1, 0, 1),
      height,
      emission: [0, 0, 0],
      masks: {
        cells,
        cracks,
        edges,
        damagedEdges,
        deposition,
        highScales,
        slope: localSlope * cells,
        scratches,
        pits,
        microDamage,
        componentId: cell.componentId,
      },
    };
  };

  const mask = (name: OrganicCellScalesMaskName) => (u: number, v: number) => evaluate(u, v).masks[name];
  return {
    sample: evaluate,
    fields: {
      baseColor: (u, v) => evaluate(u, v).baseColor,
      metallic: (u, v) => evaluate(u, v).metallic,
      roughness: (u, v) => evaluate(u, v).roughness,
      ao: (u, v) => evaluate(u, v).ao,
      height: (u, v) => evaluate(u, v).height,
      emission: (u, v) => evaluate(u, v).emission,
      normalStrength,
      tileable: true,
    },
    masks: {
      cells: mask("cells"),
      cracks: mask("cracks"),
      edges: mask("edges"),
      damagedEdges: mask("damagedEdges"),
      deposition: mask("deposition"),
      highScales: mask("highScales"),
      slope: mask("slope"),
      scratches: mask("scratches"),
      pits: mask("pits"),
      microDamage: mask("microDamage"),
      componentId: mask("componentId"),
    },
  };
}

/** Standard field-preset entry used by PRESETS and browser live baking. */
export function organicCellScales(params: OrganicCellScalesParams = {}): MaterialFields {
  return createOrganicCellScalesRecipe(params).fields;
}

/** Bake PBR plus named semantic masks in one deterministic pass. */
export function bakeOrganicCellScales(
  size: number,
  params: OrganicCellScalesParams = {},
): OrganicCellScalesBake {
  const resolution = Math.max(16, Math.floor(size));
  const recipe = createOrganicCellScalesRecipe(params);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const maskNames = Object.keys(recipe.masks) as OrganicCellScalesMaskName[];
  const masks = Object.fromEntries(maskNames.map((name) => [
    name,
    makeTexture(resolution, resolution, 1),
  ])) as Record<OrganicCellScalesMaskName, TextureBuffer>;

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const pixelSample = recipe.sample(u, v);
      const rgb = pixelSample.baseColor;
      baseColor.data[pixel * 3] = rgb[0];
      baseColor.data[pixel * 3 + 1] = rgb[1];
      baseColor.data[pixel * 3 + 2] = rgb[2];
      metallic.data[pixel] = pixelSample.metallic;
      roughness.data[pixel] = pixelSample.roughness;
      ao.data[pixel] = pixelSample.ao;
      height.data[pixel] = pixelSample.height;
      for (const name of maskNames) masks[name].data[pixel] = pixelSample.masks[name];
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
      normal: heightToNormal(height, recipe.fields.normalStrength ?? 2, true),
    },
    masks,
  };
}
