/**
 * SBS reproduction recipes — procedural re-creations of a curated subset of the
 * Substance Designer "Materials_99_procedural_Vol2" pack. The goal is not a
 * pixel copy of the node graphs (SBS is a proprietary node format); it is a
 * shape/material match built from Meshova's own primitives, so we can render a
 * side-by-side against the pack's baked PBR maps and drive the diff down.
 *
 * Each recipe returns MaterialFields, baked at any resolution by the caller.
 * Channel targets (mean color / roughness / metallic) were sampled from the
 * reference bakes and used to tune the ramps and constants below.
 */
import { makeNoise, fbm2 } from "../random/noise.js";
import { voronoi, ramp, blendColor } from "./patterns.js";
import { brick as brickMask, brickValue } from "./patterns2.js";
import { clamp } from "../math/scalar.js";
import type { MaterialFields } from "./pbr.js";

const clamp01 = (x: number) => clamp(x, 0, 1);

export interface SbsReproParams {
  seed?: number;
  uvScale?: number;
  brightness?: number;
  contrast?: number;
  roughnessShift?: number;
  heightStrength?: number;
  normalScale?: number;
  [key: string]: unknown;
}

export interface SbsParamSpec {
  key: string;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | [number, number, number];
}

const COMMON_SBS_PARAMS: SbsParamSpec[] = [
  { key: "uvScale", label: "纹理缩放", type: "range", min: 0.25, max: 4, step: 0.05, default: 1 },
  { key: "brightness", label: "明度", type: "range", min: 0.5, max: 1.5, step: 0.02, default: 1 },
  { key: "contrast", label: "对比度", type: "range", min: 0, max: 2, step: 0.02, default: 1 },
  { key: "roughnessShift", label: "粗糙度偏移", type: "range", min: -0.5, max: 0.5, step: 0.01, default: 0 },
  { key: "heightStrength", label: "高度强度", type: "range", min: 0, max: 2, step: 0.02, default: 1 },
  { key: "normalScale", label: "法线强度", type: "range", min: 0, max: 2, step: 0.02, default: 1 },
];

const SEED_PARAM: SbsParamSpec = {
  key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 5,
};

function recipeSchema(specific: SbsParamSpec[] = [], seed = 5): SbsParamSpec[] {
  return [{ ...SEED_PARAM, default: seed }, ...specific, ...COMMON_SBS_PARAMS];
}

function wrapCoordinates<T>(fn: ((u: number, v: number) => T) | undefined, scale: number) {
  if (!fn) return undefined;
  return (u: number, v: number) => fn((u * scale) % 1, (v * scale) % 1);
}

function applySbsControls(fields: MaterialFields, params: SbsReproParams): MaterialFields {
  const scale = Number(params.uvScale ?? 1);
  const brightness = Number(params.brightness ?? 1);
  const contrast = Number(params.contrast ?? 1);
  const roughnessShift = Number(params.roughnessShift ?? 0);
  const heightStrength = Number(params.heightStrength ?? 1);
  const normalScale = Number(params.normalScale ?? 1);
  const baseColor = wrapCoordinates(fields.baseColor, scale);
  const roughness = wrapCoordinates(fields.roughness, scale);
  const height = wrapCoordinates(fields.height, scale);
  const controlledFields: MaterialFields = {
    ...fields,
    normalStrength: (fields.normalStrength ?? 2) * normalScale,
  };
  if (baseColor) {
    controlledFields.baseColor = (u, v) => {
      const color = baseColor(u, v);
      return color.map((channel) => clamp01(clamp01((channel - 0.5) * contrast + 0.5) * brightness)) as [number, number, number];
    };
  }
  const metallic = wrapCoordinates(fields.metallic, scale);
  if (metallic) controlledFields.metallic = metallic;
  if (roughness) controlledFields.roughness = (u, v) => clamp(roughness(u, v) + roughnessShift, 0.04, 1);
  const ao = wrapCoordinates(fields.ao, scale);
  if (ao) controlledFields.ao = ao;
  if (height) controlledFields.height = (u, v) => clamp01(0.5 + (height(u, v) - 0.5) * heightStrength);
  const emission = wrapCoordinates(fields.emission, scale);
  if (emission) controlledFields.emission = emission;
  return controlledFields;
}

function controlled<T extends SbsReproParams>(recipe: (params?: T) => MaterialFields) {
  return (params: T = {} as T) => applySbsControls(recipe(params), params);
}

/**
 * baseColor is authored directly in the viewer/sRGB display space (matching the
 * existing presets and the reference bakes, which are sRGB JPEGs). No
 * sRGB<->linear conversion here so the exported PNG shares the reference's color
 * space and the diff is apples-to-apples.
 */
function lin(rgb: [number, number, number]): [number, number, number] {
  return rgb;
}

// ---------------------------------------------------------------------------
// 1. Metal_Knurled_01 — diamond cross-hatch knurl on dark steel.
//    ref: base sRGB ~(.276,.265,.238), rough ~0.30, metallic 1.0
// ---------------------------------------------------------------------------
export function metalKnurled(
  params: { seed?: number; freq?: number; depth?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 3;
  const freq = params.freq ?? 26;
  const depth = params.depth ?? 1;
  const noise = makeNoise(seed);
  const ridge = (u: number, v: number) => {
    const a = Math.sin((u + v) * freq * Math.PI);
    const b = Math.sin((u - v) * freq * Math.PI);
    const ra = Math.pow(Math.abs(a), 0.6);
    const rb = Math.pow(Math.abs(b), 0.6);
    return clamp01((ra + rb) * 0.5);
  };
  const grime = (u: number, v: number) =>
    fbm2(noise, u * 5, v * 5, { octaves: 4 }) * 0.5 + 0.5;
  const steel = lin([0.3, 0.29, 0.26]);
  return {
    baseColor: (u, v) => {
      const g = grime(u, v);
      const h = ridge(u, v);
      const dark = blendColor(steel, [0.09, 0.085, 0.08], 0.6);
      return blendColor(dark, steel, clamp01(h * 0.7 + g * 0.3));
    },
    metallic: () => 1,
    roughness: (u, v) => {
      const h = ridge(u, v);
      return clamp(0.42 - h * 0.22 + (grime(u, v) - 0.5) * 0.08, 0.04, 1);
    },
    ao: (u, v) => clamp01(0.7 + ridge(u, v) * 0.3),
    height: (u, v) => clamp01(ridge(u, v) * depth),
    normalStrength: 4,
  };
}

// ---------------------------------------------------------------------------
// 2. Tiles_01 — small dark tiles, near-black glossy grout.
//    ref: base sRGB ~(.214,.02,.018) deep red, rough ~0.09 (glossy), metal 0
// ---------------------------------------------------------------------------
export function tilesGlossy(
  params: { seed?: number; columns?: number; rows?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 8;
  const cols = params.columns ?? 10;
  const rows = params.rows ?? 10;
  const opts = { columns: cols, rows, mortar: 0.06, offset: 0.5, seed };
  const mask = brickMask(opts);
  const value = brickValue(opts);
  const noise = makeNoise(seed + 1);
  const tileRamp = ramp([
    { at: 0.0, color: lin([0.12, 0.01, 0.01]) },
    { at: 0.6, color: lin([0.24, 0.02, 0.02]) },
    { at: 1.0, color: lin([0.34, 0.05, 0.04]) },
  ]);
  const grout = lin([0.03, 0.03, 0.035]);
  return {
    baseColor: (u, v) => {
      if (mask(u, v) < 0.5) return grout;
      const n = fbm2(noise, u * 30, v * 30, { octaves: 2 }) * 0.12;
      return tileRamp(clamp01(value(u, v) * 0.8 + n + 0.1));
    },
    metallic: () => 0,
    roughness: (u, v) =>
      mask(u, v) < 0.5 ? 0.5 : clamp(0.06 + value(u, v) * 0.06, 0.04, 1),
    ao: (u, v) => (mask(u, v) < 0.5 ? 0.5 : 1),
    height: (u, v) => (mask(u, v) < 0.5 ? 0.15 : 0.75),
    normalStrength: 4,
  };
}

// ---------------------------------------------------------------------------
// 3. Stylized_01_Bricks — hand-painted red brick, dark recessed mortar.
//    ref: base sRGB ~(.547,.397,.335), rough ~0.59, metal 0
// ---------------------------------------------------------------------------
export function stylizedBricks(
  params: { seed?: number; columns?: number; rows?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 4;
  const cols = params.columns ?? 6;
  const rows = params.rows ?? 11;
  const opts = { columns: cols, rows, mortar: 0.06, offset: 0.5, seed };
  const mask = brickMask(opts);
  const value = brickValue(opts);
  const grain = makeNoise(seed + 2);
  const brickR = ramp([
    { at: 0.0, color: lin([0.52, 0.34, 0.28]) },
    { at: 0.5, color: lin([0.62, 0.45, 0.38]) },
    { at: 1.0, color: lin([0.7, 0.55, 0.48]) },
  ]);
  const mortar = lin([0.34, 0.26, 0.22]);
  return {
    baseColor: (u, v) => {
      if (mask(u, v) < 0.5) return mortar;
      const n = fbm2(grain, u * 24, v * 24, { octaves: 3 }) * 0.18;
      return brickR(clamp01(value(u, v) * 0.7 + n + 0.1));
    },
    metallic: () => 0,
    roughness: (u, v) =>
      mask(u, v) < 0.5 ? 0.8 : clamp(0.55 + value(u, v) * 0.1, 0.04, 1),
    ao: (u, v) => (mask(u, v) < 0.5 ? 0.45 : 1),
    height: (u, v) => {
      if (mask(u, v) < 0.5) return 0.15;
      return clamp01(0.7 + fbm2(grain, u * 40, v * 40, { octaves: 2 }) * 0.15);
    },
    normalStrength: 5,
  };
}

// ---------------------------------------------------------------------------
// 4. Plastic_01 — dark textured plastic, fine pebbled grain, semi-matte.
//    ref: base sRGB ~(.065,.065,.059) near-black, rough ~0.52, metal 0
// ---------------------------------------------------------------------------
export function plasticPebbled(
  params: { seed?: number; grain?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 6;
  const grainScale = params.grain ?? 90;
  const noise = makeNoise(seed);
  const cells = voronoi({ scale: 80, seed, metric: "f1" });
  const base = lin([0.07, 0.07, 0.063]);
  return {
    baseColor: (u, v) => {
      const g = fbm2(noise, u * grainScale, v * grainScale, { octaves: 2 });
      const shade = 1 + g * 0.25;
      return [
        clamp01(base[0] * shade),
        clamp01(base[1] * shade),
        clamp01(base[2] * shade),
      ];
    },
    metallic: () => 0,
    roughness: (u, v) =>
      clamp(0.5 + (cells(u, v) - 0.5) * 0.08 + fbm2(noise, u * grainScale, v * grainScale, { octaves: 2 }) * 0.04, 0.04, 1),
    ao: () => 1,
    height: (u, v) =>
      clamp01(0.5 + cells(u, v) * 0.25 + fbm2(noise, u * grainScale, v * grainScale, { octaves: 3 }) * 0.15),
    normalStrength: 2.5,
  };
}

// ---------------------------------------------------------------------------
// 5. Wood_Parquet_01 — herringbone plank layout, warm grain streaks.
//    ref: base sRGB ~(.227,.13,.046), rough ~0.19 (satin), metal 0
// ---------------------------------------------------------------------------
export function woodParquet(
  params: { seed?: number; planks?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 9;
  const planks = params.planks ?? 6; // herringbone repeats per axis
  const grain = makeNoise(seed);
  const woodR = ramp([
    { at: 0.0, color: lin([0.16, 0.08, 0.03]) },
    { at: 0.5, color: lin([0.28, 0.16, 0.06]) },
    { at: 1.0, color: lin([0.4, 0.24, 0.1]) },
  ]);
  // herringbone: split tile into two diagonal-oriented plank regions.
  // returns [orientation(0|1), localAlongPlank]
  const herring = (u: number, v: number): { dir: number; s: number; id: number } => {
    const gu = u * planks;
    const gv = v * planks;
    const cx = Math.floor(gu);
    const cy = Math.floor(gv);
    const fx = gu - cx;
    const fy = gv - cy;
    // checkerboard of orientation
    const dir = (cx + cy) % 2;
    const along = dir === 0 ? fx : fy;
    const id = ((cx * 73856093) ^ (cy * 19349663) ^ (seed * 83492791)) >>> 0;
    return { dir, s: along, id: (id % 1000) / 1000 };
  };
  return {
    baseColor: (u, v) => {
      const { dir, id } = herring(u, v);
      // grain runs along plank length
      const g = dir === 0
        ? fbm2(grain, u * 60, v * 8, { octaves: 3 })
        : fbm2(grain, u * 8, v * 60, { octaves: 3 });
      const t = clamp01(0.4 + g * 0.5 + (id - 0.5) * 0.4);
      return woodR(t);
    },
    metallic: () => 0,
    roughness: (u, v) => {
      const { dir } = herring(u, v);
      const g = dir === 0
        ? fbm2(grain, u * 60, v * 8, { octaves: 3 })
        : fbm2(grain, u * 8, v * 60, { octaves: 3 });
      return clamp(0.18 + g * 0.06, 0.04, 1);
    },
    ao: () => 1,
    height: (u, v) => {
      const { s } = herring(u, v);
      // slight bevel at plank seams
      const seam = Math.min(s, 1 - s);
      return clamp01(0.7 - (seam < 0.06 ? (0.06 - seam) * 6 : 0));
    },
    normalStrength: 2,
  };
}

// ---------------------------------------------------------------------------
// 6. Concrete_Decorative_01 — light grey concrete, subtle blotch + pores.
//    ref: base sRGB ~(.546,.541,.521), rough ~0.70 (uniform), metal 0
// ---------------------------------------------------------------------------
export function concreteDecorative(
  params: { seed?: number; scale?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 12;
  const sc = params.scale ?? 6;
  const noise = makeNoise(seed);
  const pores = voronoi({ scale: 70, seed: seed + 1, metric: "f2-f1" });
  const base = lin([0.56, 0.555, 0.535]);
  return {
    baseColor: (u, v) => {
      const blotch = fbm2(noise, u * sc, v * sc, { octaves: 5 }) * 0.16;
      const p = pores(u, v) > 0.85 ? -0.15 : 0;
      const shade = 1 + blotch + p;
      return [
        clamp01(base[0] * shade),
        clamp01(base[1] * shade),
        clamp01(base[2] * shade),
      ];
    },
    metallic: () => 0,
    roughness: (u, v) =>
      clamp(0.7 + fbm2(noise, u * sc * 3, v * sc * 3, { octaves: 3 }) * 0.03, 0.04, 1),
    ao: (u, v) => clamp01(1 - (pores(u, v) > 0.85 ? 0.3 : 0)),
    height: (u, v) => {
      // low-freq blotch + high-freq grain so the derived normal has the fine
      // pebbled relief the reference shows (xy deviation ~0.09).
      const lowf = fbm2(noise, u * sc, v * sc, { octaves: 4 }) * 0.15;
      const grain = fbm2(noise, u * sc * 12, v * sc * 12, { octaves: 3 }) * 0.2;
      const p = pores(u, v) > 0.9 ? -0.1 : 0;
      return clamp01(0.5 + lowf + grain + p);
    },
    normalStrength: 1.6,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers for the batch below — keep recipes terse and data-driven.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const shade = (c: RGB, k: number): RGB => [
  clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k),
];
/** Speckled matte/rough surface driven by fbm around target color/roughness. */
function speckle(
  base: RGB, rough: number, metal: number,
  opts: { seed?: number; scale?: number; colorVar?: number; roughVar?: number; relief?: number; nStr?: number } = {},
): MaterialFields {
  const seed = opts.seed ?? 5;
  const sc = opts.scale ?? 8;
  const cv = opts.colorVar ?? 0.18;
  const rv = opts.roughVar ?? 0.06;
  const relief = opts.relief ?? 0.4;
  const n = makeNoise(seed);
  return {
    baseColor: (u, v) => shade(base, 1 + fbm2(n, u * sc, v * sc, { octaves: 5 }) * cv),
    metallic: () => metal,
    roughness: (u, v) => clamp(rough + fbm2(n, u * sc * 2, v * sc * 2, { octaves: 3 }) * rv, 0.04, 1),
    ao: () => 1,
    height: (u, v) => clamp01(0.5
      + fbm2(n, u * sc, v * sc, { octaves: 4 }) * relief
      + fbm2(n, u * sc * 6, v * sc * 6, { octaves: 3 }) * relief * 0.5),
    normalStrength: opts.nStr ?? 2,
  };
}
/** Square/offset tile grid with per-tile color variation and recessed grout. */
function tiled(
  tile: RampStopColor, grout: RGB, rough: number, metal: number,
  opts: { seed?: number; columns?: number; rows?: number; mortar?: number; offset?: number; groutRough?: number; nStr?: number; colorVar?: number } = {},
): MaterialFields {
  const seed = opts.seed ?? 7;
  const o = { columns: opts.columns ?? 8, rows: opts.rows ?? 8, mortar: opts.mortar ?? 0.05, offset: opts.offset ?? 0, seed };
  const mask = brickMask(o);
  const value = brickValue(o);
  const n = makeNoise(seed + 1);
  const cv = opts.colorVar ?? 0.9;
  const r = ramp(tile);
  return {
    baseColor: (u, v) => {
      if (mask(u, v) < 0.5) return grout;
      const t = clamp01(value(u, v) * cv + fbm2(n, u * 26, v * 26, { octaves: 2 }) * 0.12 + (1 - cv) * 0.5);
      return r(t);
    },
    metallic: () => metal,
    roughness: (u, v) => (mask(u, v) < 0.5 ? (opts.groutRough ?? 0.6) : clamp(rough + value(u, v) * 0.05, 0.04, 1)),
    ao: (u, v) => (mask(u, v) < 0.5 ? 0.5 : 1),
    height: (u, v) => (mask(u, v) < 0.5 ? 0.12 : clamp01(0.7 + value(u, v) * 0.1)),
    normalStrength: opts.nStr ?? 4,
  };
}
type RampStopColor = { at: number; color: RGB }[];

/** Straight wood planks with lengthwise grain streaks and seam bevels. */
function planks(
  low: RGB, hi: RGB, rough: number,
  opts: { seed?: number; count?: number; vertical?: boolean; roughVar?: number; nStr?: number } = {},
): MaterialFields {
  const seed = opts.seed ?? 9;
  const count = opts.count ?? 5;
  const vertical = opts.vertical ?? false;
  const grain = makeNoise(seed);
  const woodR = ramp([
    { at: 0, color: low },
    { at: 0.5, color: blendColor(low, hi, 0.5) },
    { at: 1, color: hi },
  ]);
  const plank = (u: number, v: number) => {
    const a = vertical ? u : v; // across-plank axis
    const idx = Math.floor(a * count);
    const local = a * count - idx;
    const id = ((idx * 2654435761) >>> 0) % 1000 / 1000;
    return { local, id };
  };
  return {
    baseColor: (u, v) => {
      const { id } = plank(u, v);
      const g = vertical
        ? fbm2(grain, u * 10, v * 70, { octaves: 3 })
        : fbm2(grain, u * 70, v * 10, { octaves: 3 });
      return woodR(clamp01(0.4 + g * 0.5 + (id - 0.5) * 0.5));
    },
    metallic: () => 0,
    roughness: (u, v) => {
      const g = vertical
        ? fbm2(grain, u * 10, v * 70, { octaves: 3 })
        : fbm2(grain, u * 70, v * 10, { octaves: 3 });
      return clamp(rough + g * (opts.roughVar ?? 0.06), 0.04, 1);
    },
    ao: () => 1,
    height: (u, v) => {
      const { local } = plank(u, v);
      const seam = Math.min(local, 1 - local);
      return clamp01(0.72 - (seam < 0.05 ? (0.05 - seam) * 8 : 0));
    },
    normalStrength: opts.nStr ?? 3,
  };
}

// ---------------------------------------------------------------------------
// Batch recipes — tuned to the sampled channel means of each reference bake.
// Each is a thin wrapper over the shared helpers so params stay data-driven.
// ---------------------------------------------------------------------------

// Metals (metallic=1, brushed/knurled variants)
const metalKnurled02 = (p: { seed?: number } = {}) =>
  metalKnurled({ seed: p.seed ?? 5, freq: 22, depth: 0.9 });
const metalKnurled03 = (p: { seed?: number } = {}) =>
  ({ ...metalKnurled({ seed: p.seed ?? 7, freq: 30, depth: 0.7 }), roughness: () => 0.5 } as MaterialFields);
const tilesMetallic = (p: { seed?: number } = {}) =>
  speckle([0.24, 0.225, 0.229], 0.35, 0.66, { seed: p.seed ?? 3, scale: 10, colorVar: 0.1, roughVar: 0.08, relief: 0.2, nStr: 1.5 });

// Plastics (dielectric, low color variation)
const plasticRed = (p: { seed?: number } = {}) =>
  speckle([0.6, 0.034, 0.035], 0.55, 0, { seed: p.seed ?? 6, scale: 70, colorVar: 0.06, roughVar: 0.05, relief: 0.25, nStr: 2 });
const plasticRedLight = (p: { seed?: number } = {}) =>
  speckle([0.569, 0.172, 0.172], 0.43, 0, { seed: p.seed ?? 8, scale: 60, colorVar: 0.08, roughVar: 0.05, relief: 0.25, nStr: 2 });
const plasticDark = (p: { seed?: number } = {}) =>
  speckle([0.039, 0.039, 0.039], 0.54, 0, { seed: p.seed ?? 4, scale: 90, colorVar: 0.1, roughVar: 0.05, relief: 0.2, nStr: 1.8 });
const bubbleWrap = (p: { seed?: number } = {}): MaterialFields => {
  const seed = p.seed ?? 2;
  const cells = voronoi({ scale: 12, seed, metric: "f1" });
  return {
    baseColor: () => [0.319, 0.318, 0.318],
    metallic: () => 0,
    roughness: () => 0.2,
    ao: () => 1,
    height: (u, v) => clamp01(1 - cells(u, v)),
    normalStrength: 3,
  };
};

// Walls / concrete / plaster (rough dielectric)
const wallPainted = (p: { seed?: number } = {}) =>
  speckle([0.146, 0.146, 0.146], 0.43, 0, { seed: p.seed ?? 11, scale: 6, colorVar: 0.12, roughVar: 0.06, relief: 0.35, nStr: 1.6 });
const facadeStone = (p: { seed?: number } = {}) =>
  speckle([0.46, 0.459, 0.458], 0.51, 0, { seed: p.seed ?? 13, scale: 5, colorVar: 0.18, roughVar: 0.03, relief: 0.28, nStr: 1.6 });
const wallpaper = (p: { seed?: number } = {}) =>
  speckle([0.295, 0.304, 0.32], 0.41, 0.26, { seed: p.seed ?? 15, scale: 12, colorVar: 0.08, roughVar: 0.04, relief: 0.12, nStr: 1.2 });

// Terrain-ish stylized (sand/snow/grass/stone)
const sand = (p: { seed?: number } = {}) =>
  speckle([0.818, 0.532, 0.323], 0.6, 0, { seed: p.seed ?? 17, scale: 40, colorVar: 0.12, roughVar: 0.05, relief: 0.35, nStr: 2.5 });
const snow = (p: { seed?: number } = {}) =>
  speckle([0.882, 0.905, 0.914], 0.56, 0, { seed: p.seed ?? 19, scale: 6, colorVar: 0.06, roughVar: 0.06, relief: 0.4, nStr: 2 });
const grass = (p: { seed?: number } = {}) =>
  speckle([0.265, 0.388, 0.12], 0.53, 0, { seed: p.seed ?? 21, scale: 60, colorVar: 0.18, roughVar: 0.05, relief: 0.4, nStr: 2.5 });
const rice = (p: { seed?: number } = {}): MaterialFields => {
  const seed = p.seed ?? 23;
  const cells = voronoi({ scale: 26, seed, metric: "f1" });
  const n = makeNoise(seed + 1);
  return {
    baseColor: (u, v) => shade([0.603, 0.588, 0.564], 1 + (cells(u, v) - 0.5) * 0.18),
    metallic: () => 0,
    roughness: () => 0.33,
    ao: () => 1,
    height: (u, v) => clamp01(0.4 + (1 - cells(u, v)) * 0.5 + fbm2(n, u * 40, v * 40, { octaves: 2 }) * 0.1),
    normalStrength: 3,
  };
};

// Tiles (glossy ceramic grids)
const tilesDarkGlossy = (p: { seed?: number; columns?: number; rows?: number } = {}) =>
  tiled([{ at: 0, color: [0.16, 0.16, 0.16] }, { at: 1, color: [0.21, 0.21, 0.21] }],
    [0.12, 0.12, 0.12], 0.08, 0, { seed: p.seed ?? 5, columns: p.columns ?? 8, rows: p.rows ?? 8, mortar: 0.03, groutRough: 0.12, colorVar: 0.5 });
const tilesBlueGlossy = (p: { seed?: number; columns?: number; rows?: number } = {}) =>
  tiled([{ at: 0, color: [0.48, 0.56, 0.57] }, { at: 1, color: [0.55, 0.62, 0.63] }],
    [0.4, 0.45, 0.46], 0.13, 0, { seed: p.seed ?? 6, columns: p.columns ?? 6, rows: p.rows ?? 6, mortar: 0.03, groutRough: 0.14, colorVar: 0.4 });
const kitchenTiles = (p: { seed?: number; columns?: number; rows?: number } = {}) =>
  tiled([{ at: 0, color: [0.75, 0.735, 0.675] }, { at: 1, color: [0.78, 0.765, 0.7] }],
    [0.72, 0.705, 0.65], 0.13, 0, { seed: p.seed ?? 9, columns: p.columns ?? 5, rows: p.rows ?? 5, mortar: 0.025, groutRough: 0.16, colorVar: 0.3 });

// Wood (straight planks + parquet)
const woodBase = (p: { seed?: number; count?: number } = {}) =>
  planks([0.32, 0.2, 0.12], [0.55, 0.38, 0.26], 0.44, { seed: p.seed ?? 9, count: p.count ?? 4 });
const woodPlanksStylized = (p: { seed?: number; count?: number } = {}) =>
  planks([0.34, 0.22, 0.1], [0.62, 0.44, 0.24], 0.52, { seed: p.seed ?? 11, count: p.count ?? 6 });
const woodParquet02 = (p: { seed?: number; planks?: number } = {}) =>
  woodParquet({ seed: p.seed ?? 5, planks: p.planks ?? 7 });
interface WoodOsbParams extends SbsReproParams {
  baseColor?: RGB;
  fiberScale?: number;
  colorVariation?: number;
  roughness?: number;
  roughnessVariation?: number;
  relief?: number;
  bumpStrength?: number;
}

const woodOSB = (p: WoodOsbParams = {}) =>
  speckle(p.baseColor ?? [0.655, 0.489, 0.322], Number(p.roughness ?? 0.62), 0, {
    seed: p.seed ?? 25,
    scale: Number(p.fiberScale ?? 30),
    colorVar: Number(p.colorVariation ?? 0.16),
    roughVar: Number(p.roughnessVariation ?? 0.06),
    relief: Number(p.relief ?? 0.3),
    nStr: Number(p.bumpStrength ?? 2),
  });

// Skin (soft dielectric, low variation)
const skinLight = (p: { seed?: number } = {}) =>
  speckle([0.795, 0.667, 0.59], 0.59, 0, { seed: p.seed ?? 27, scale: 50, colorVar: 0.05, roughVar: 0.04, relief: 0.2, nStr: 1.5 });
const skinTan = (p: { seed?: number } = {}) =>
  speckle([0.858, 0.595, 0.471], 0.43, 0, { seed: p.seed ?? 29, scale: 45, colorVar: 0.06, roughVar: 0.04, relief: 0.2, nStr: 1.5 });

/** Registry of SBS reproduction recipes, keyed by the reference folder name. */
export const SBS_REPRO = {
  Metal_Knurled_01: controlled(metalKnurled),
  Metal_Knurled_02: controlled(metalKnurled02),
  Metal_Knurled_03: controlled(metalKnurled03),
  Tiles_Metallic_01: controlled(tilesMetallic),
  Tiles_01: controlled(tilesGlossy),
  Tiles_04: controlled(tilesDarkGlossy),
  Tiles_02: controlled(tilesBlueGlossy),
  Wall_KitchenTiles_01: controlled(kitchenTiles),
  Stylized_01_Bricks: controlled(stylizedBricks),
  Plastic_01: controlled(plasticPebbled),
  Plastic_02: controlled(plasticRed),
  Plastic_03: controlled(plasticDark),
  Plastic_04: controlled(plasticRedLight),
  Plastic_BubbleWrap_01: controlled(bubbleWrap),
  Wall_PaintedRough_01: controlled(wallPainted),
  Facades_07: controlled(facadeStone),
  Wall_Walpaper_01: controlled(wallpaper),
  Concrete_Decorative_01: controlled(concreteDecorative),
  Stylized_06_Sand: controlled(sand),
  Stylized_08_Snow: controlled(snow),
  Stylized_15_Grass: controlled(grass),
  Food_Rice_01: controlled(rice),
  Wood_Parquet_01: controlled(woodParquet),
  Wood_Parquet_02: controlled(woodParquet02),
  Wood_Base_01: controlled(woodBase),
  Stylized_03_Wood_Planks: controlled(woodPlanksStylized),
  Wood_OBS_01: controlled(woodOSB),
  Skin_02: controlled(skinLight),
  Skin_03: controlled(skinTan),
} as const;

export type SbsReproName = keyof typeof SBS_REPRO;

const GRID_PARAMS: SbsParamSpec[] = [
  { key: "columns", label: "横向格数", type: "range", min: 2, max: 24, step: 1, default: 8 },
  { key: "rows", label: "纵向格数", type: "range", min: 2, max: 24, step: 1, default: 8 },
];

export const SBS_PARAM_SCHEMA: Record<SbsReproName, SbsParamSpec[]> = {
  Metal_Knurled_01: recipeSchema([
    { key: "freq", label: "滚花密度", type: "range", min: 8, max: 48, step: 1, default: 26 },
    { key: "depth", label: "滚花深度", type: "range", min: 0.2, max: 2, step: 0.05, default: 1 },
  ], 3),
  Metal_Knurled_02: recipeSchema([], 5),
  Metal_Knurled_03: recipeSchema([], 7),
  Tiles_Metallic_01: recipeSchema([], 3),
  Tiles_01: recipeSchema(GRID_PARAMS.map((spec) => ({ ...spec, default: 10 })), 8),
  Tiles_04: recipeSchema(GRID_PARAMS, 5),
  Tiles_02: recipeSchema(GRID_PARAMS.map((spec) => ({ ...spec, default: 6 })), 6),
  Wall_KitchenTiles_01: recipeSchema(GRID_PARAMS.map((spec) => ({ ...spec, default: 5 })), 9),
  Stylized_01_Bricks: recipeSchema([
    { ...GRID_PARAMS[0]!, default: 6 }, { ...GRID_PARAMS[1]!, default: 11 },
  ], 4),
  Plastic_01: recipeSchema([
    { key: "grain", label: "颗粒密度", type: "range", min: 30, max: 160, step: 5, default: 90 },
  ], 6),
  Plastic_02: recipeSchema([], 6),
  Plastic_03: recipeSchema([], 4),
  Plastic_04: recipeSchema([], 8),
  Plastic_BubbleWrap_01: recipeSchema([], 2),
  Wall_PaintedRough_01: recipeSchema([], 11),
  Facades_07: recipeSchema([], 13),
  Wall_Walpaper_01: recipeSchema([], 15),
  Concrete_Decorative_01: recipeSchema([
    { key: "scale", label: "斑驳频率", type: "range", min: 2, max: 14, step: 0.5, default: 6 },
  ], 12),
  Stylized_06_Sand: recipeSchema([], 17),
  Stylized_08_Snow: recipeSchema([], 19),
  Stylized_15_Grass: recipeSchema([], 21),
  Food_Rice_01: recipeSchema([], 23),
  Wood_Parquet_01: recipeSchema([
    { key: "planks", label: "拼花密度", type: "range", min: 2, max: 12, step: 1, default: 6 },
  ], 9),
  Wood_Parquet_02: recipeSchema([
    { key: "planks", label: "拼花密度", type: "range", min: 2, max: 12, step: 1, default: 7 },
  ], 5),
  Wood_Base_01: recipeSchema([
    { key: "count", label: "木板数", type: "range", min: 2, max: 12, step: 1, default: 4 },
  ], 9),
  Stylized_03_Wood_Planks: recipeSchema([
    { key: "count", label: "木板数", type: "range", min: 2, max: 12, step: 1, default: 6 },
  ], 11),
  Wood_OBS_01: recipeSchema([
    { key: "baseColor", label: "木片基色", type: "rgb", default: [0.655, 0.489, 0.322] },
    { key: "fiberScale", label: "木片密度", type: "range", min: 6, max: 100, step: 1, default: 30 },
    { key: "colorVariation", label: "色差", type: "range", min: 0, max: 0.5, step: 0.01, default: 0.16 },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: 0.62 },
    { key: "roughnessVariation", label: "粗糙度变化", type: "range", min: 0, max: 0.3, step: 0.01, default: 0.06 },
    { key: "relief", label: "木片起伏", type: "range", min: 0, max: 1, step: 0.02, default: 0.3 },
    { key: "bumpStrength", label: "木片法线", type: "range", min: 0, max: 6, step: 0.1, default: 2 },
  ], 25),
  Skin_02: recipeSchema([], 27),
  Skin_03: recipeSchema([], 29),
};

export function defaultSbsParams(name: SbsReproName): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const spec of SBS_PARAM_SCHEMA[name]) {
    params[spec.key] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  return params;
}
