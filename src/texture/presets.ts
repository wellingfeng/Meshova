/**
 * Procedural material presets — shared recipes used by both the Node export
 * example and the browser viewer's live texture generation. The texture is
 * always computed from these functions; no static bitmap is ever the source.
 *
 * Each preset returns MaterialFields so callers can bake at any resolution
 * (Node exports PNGs, the viewer fills DataTextures live).
 */
import { makeNoise, fbm2 } from "../random/noise.js";
import { voronoi, ramp } from "./patterns.js";
import { blendColor, blend } from "./patterns.js";
import {
  wave as wavePattern,
  brick as brickMask,
  brickValue,
  ridgedMultiFractal,
  multiFractal,
} from "./patterns2.js";
import { dots } from "./patterns3.js";
import { generate, sample } from "./buffer.js";
import {
  bevel,
  distanceField,
  blur,
  levels,
  blendTex,
  gradientMap,
  aoFromHeight,
} from "./filters.js";
import { floodFillRandom, tileSampler } from "./tiling.js";
import { clamp } from "../math/scalar.js";
import { heightToNormal, type MaterialFields, type Material } from "./pbr.js";

export interface PresetParams {
  seed?: number;
}

/** Rusty pitted metal. */
export function rustyMetal(
  params: PresetParams & { rust?: number; scale?: number; roughness?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 7;
  const rust = params.rust ?? 0.15;
  const sc = params.scale ?? 4;
  const roughBias = params.roughness ?? 0;
  const noise = makeNoise(seed);
  const rustMask = (u: number, v: number) =>
    clamp(fbm2(noise, u * sc, v * sc, { octaves: 5 }) * 0.5 + 0.5 + rust, 0, 1);
  const grain = (u: number, v: number) =>
    fbm2(noise, u * 26, v * 26, { octaves: 3 }) * 0.5 + 0.5;
  const cells = voronoi({ scale: 18, seed, metric: "f1" });
  const cracks = voronoi({ scale: 9, seed: seed + 1, metric: "f2-f1" });
  const rustRamp = ramp([
    { at: 0.0, color: [0.18, 0.07, 0.03] },
    { at: 0.45, color: [0.4, 0.16, 0.06] },
    { at: 0.7, color: [0.62, 0.3, 0.12] },
    { at: 1.0, color: [0.74, 0.45, 0.22] },
  ]);
  const metalColor: [number, number, number] = [0.42, 0.43, 0.45];
  return {
    baseColor: (u, v) => {
      const m = rustMask(u, v);
      const rustC = rustRamp(clamp(cells(u, v) * 0.6 + grain(u, v) * 0.4, 0, 1));
      const metal = blendColor(metalColor, [0.2, 0.2, 0.22], cracks(u, v));
      return blendColor(metal, rustC, m);
    },
    metallic: (u, v) => blend(1, 0, rustMask(u, v)),
    roughness: (u, v) =>
      clamp(blend(0.35, 0.9, rustMask(u, v)) + grain(u, v) * 0.1 + roughBias, 0.04, 1),
    ao: (u, v) => clamp(1 - cracks(u, v) * 0.8, 0, 1),
    height: (u, v) =>
      clamp(
        0.5 + (rustMask(u, v) - 0.5) * 0.4 + grain(u, v) * 0.15 - cracks(u, v) * 0.3,
        0,
        1,
      ),
    normalStrength: 3,
  };
}

/** Soft plush fur for the teddy bear — fine fibary noise, warm tones. */
export function plushFur(
  params: PresetParams & { tint?: [number, number, number] } = {},
): MaterialFields {
  const seed = params.seed ?? 11;
  const tint = params.tint ?? [0.55, 0.36, 0.18];
  const noise = makeNoise(seed);
  // stretched noise => fiber streaks
  const fiber = (u: number, v: number) =>
    fbm2(noise, u * 60, v * 14, { octaves: 4 }) * 0.5 + 0.5;
  const clump = (u: number, v: number) =>
    fbm2(noise, u * 8, v * 8, { octaves: 3 }) * 0.5 + 0.5;
  return {
    baseColor: (u, v) => {
      const f = fiber(u, v);
      const c = clump(u, v);
      const shade = 0.7 + f * 0.45 - c * 0.15;
      return [
        clamp(tint[0] * shade, 0, 1),
        clamp(tint[1] * shade, 0, 1),
        clamp(tint[2] * shade, 0, 1),
      ];
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.85 + fiber(u, v) * 0.1, 0.04, 1),
    ao: (u, v) => clamp(0.85 + clump(u, v) * 0.15, 0, 1),
    height: (u, v) => clamp(fiber(u, v) * 0.6 + clump(u, v) * 0.4, 0, 1),
    normalStrength: 2.2,
  };
}

/** Glossy ceramic with subtle surface waviness. */
export function ceramic(
  params: PresetParams & { color?: [number, number, number] } = {},
): MaterialFields {
  const seed = params.seed ?? 5;
  const color = params.color ?? [0.85, 0.82, 0.78];
  const noise = makeNoise(seed);
  const wave = (u: number, v: number) =>
    fbm2(noise, u * 10, v * 10, { octaves: 3 }) * 0.5 + 0.5;
  return {
    baseColor: () => color,
    metallic: () => 0,
    roughness: (u, v) => clamp(0.12 + wave(u, v) * 0.06, 0.04, 1),
    ao: () => 1,
    height: (u, v) => clamp(0.5 + (wave(u, v) - 0.5) * 0.1, 0, 1),
    normalStrength: 0.8,
  };
}

/** Wood: ring waves (annual rings) + grain streaks, warm ramp. */
export function wood(
  params: PresetParams & { tone?: [number, number, number]; ringScale?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 9;
  const ringScale = params.ringScale ?? 14;
  const rings = wavePattern({ scale: ringScale, type: "rings", distortion: 1.2, seed });
  const grain = makeNoise(seed + 1);
  const streak = (u: number, v: number) =>
    fbm2(grain, u * 50, v * 6, { octaves: 3 }) * 0.5 + 0.5;
  const woodRamp = ramp([
    { at: 0.0, color: [0.32, 0.18, 0.08] },
    { at: 0.5, color: [0.52, 0.32, 0.16] },
    { at: 1.0, color: [0.64, 0.43, 0.24] },
  ]);
  return {
    baseColor: (u, v) => {
      const r = rings(u, v);
      const s = streak(u, v);
      return woodRamp(clamp(r * 0.7 + s * 0.3, 0, 1));
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.5 + rings(u, v) * 0.25, 0.04, 1),
    ao: () => 1,
    height: (u, v) => clamp(0.5 + (rings(u, v) - 0.5) * 0.3, 0, 1),
    normalStrength: 1.5,
  };
}

/** Brick wall: brick mask + per-brick color variation + mortar gaps. */
export function brickWall(
  params: PresetParams & { columns?: number; rows?: number; mortar?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 4;
  const opts = {
    columns: params.columns ?? 6,
    rows: params.rows ?? 12,
    mortar: params.mortar ?? 0.04,
    offset: 0.5,
    seed,
  };
  const mask = brickMask(opts);
  const value = brickValue(opts);
  const grain = makeNoise(seed + 2);
  const brickRamp = ramp([
    { at: 0, color: [0.45, 0.16, 0.1] },
    { at: 0.5, color: [0.6, 0.26, 0.16] },
    { at: 1, color: [0.7, 0.36, 0.24] },
  ]);
  const mortarColor: [number, number, number] = [0.72, 0.7, 0.66];
  return {
    baseColor: (u, v) => {
      const m = mask(u, v);
      if (m < 0.5) return mortarColor;
      const noise = fbm2(grain, u * 40, v * 40, { octaves: 2 }) * 0.1;
      return brickRamp(clamp(value(u, v) + noise, 0, 1));
    },
    metallic: () => 0,
    roughness: (u, v) => (mask(u, v) < 0.5 ? 0.95 : clamp(0.7 + value(u, v) * 0.15, 0.04, 1)),
    ao: (u, v) => (mask(u, v) < 0.5 ? 0.6 : 1),
    height: (u, v) => (mask(u, v) < 0.5 ? 0.2 : 0.7),
    normalStrength: 3,
  };
}

/** Rocky terrain: ridged multifractal height -> rock color ramp. */
export function terrain(
  params: PresetParams & { scale?: number; octaves?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 12;
  const sc = params.scale ?? 5;
  const oct = params.octaves ?? 6;
  const ridges = ridgedMultiFractal(seed, { scale: sc, octaves: oct });
  const base = multiFractal(seed + 3, { scale: 3, octaves: 4 });
  const rockRamp = ramp([
    { at: 0.0, color: [0.22, 0.2, 0.18] },
    { at: 0.45, color: [0.4, 0.36, 0.31] },
    { at: 0.75, color: [0.55, 0.51, 0.45] },
    { at: 1.0, color: [0.7, 0.68, 0.64] },
  ]);
  return {
    baseColor: (u, v) => rockRamp(clamp(ridges(u, v) * 0.7 + base(u, v) * 0.3, 0, 1)),
    metallic: () => 0,
    roughness: () => 0.9,
    ao: (u, v) => clamp(0.7 + ridges(u, v) * 0.3, 0, 1),
    height: (u, v) => clamp(ridges(u, v) * 0.8 + base(u, v) * 0.2, 0, 1),
    normalStrength: 4,
  };
}

export const PRESETS = {
  rustyMetal,
  plushFur,
  ceramic,
  wood,
  brickWall,
  terrain,
} as const;

export type PresetName = keyof typeof PRESETS;

/**
 * Tunable parameter schema per preset, for the viewer's right-side panel.
 * Numbers render as sliders; rgb renders as a color picker. Keys map straight
 * to each preset function's params object. Same source feeds Node + browser.
 */
export interface MatParamSpec {
  key: string;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | [number, number, number];
}

export const PRESET_PARAM_SCHEMA: Record<string, MatParamSpec[]> = {
  rustyMetal: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 7 },
    { key: "rust", label: "锈蚀程度", type: "range", min: -0.3, max: 0.5, step: 0.02, default: 0.15 },
    { key: "scale", label: "锈斑频率", type: "range", min: 1, max: 12, step: 0.5, default: 4 },
    { key: "roughness", label: "粗糙偏移", type: "range", min: -0.3, max: 0.3, step: 0.02, default: 0 },
  ],
  plushFur: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 11 },
    { key: "tint", label: "绒毛颜色", type: "rgb", default: [0.55, 0.36, 0.18] },
  ],
  ceramic: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 5 },
    { key: "color", label: "釉色", type: "rgb", default: [0.85, 0.82, 0.78] },
  ],
  wood: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 9 },
    { key: "ringScale", label: "年轮密度", type: "range", min: 4, max: 30, step: 1, default: 14 },
  ],
  brickWall: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 4 },
    { key: "columns", label: "横向砖数", type: "range", min: 2, max: 16, step: 1, default: 6 },
    { key: "rows", label: "纵向砖数", type: "range", min: 4, max: 24, step: 1, default: 12 },
    { key: "mortar", label: "砖缝宽度", type: "range", min: 0.01, max: 0.12, step: 0.005, default: 0.04 },
  ],
  terrain: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 12 },
    { key: "scale", label: "山脊频率", type: "range", min: 2, max: 12, step: 0.5, default: 5 },
    { key: "octaves", label: "细节层数", type: "range", min: 1, max: 8, step: 1, default: 6 },
  ],
  tileFloor: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 21 },
  ],
};

/** Default params object for a preset/builder name from its schema. */
export function defaultMatParams(name: string): Record<string, unknown> {
  const schema = PRESET_PARAM_SCHEMA[name] ?? [];
  const out: Record<string, unknown> = {};
  for (const s of schema) out[s.key] = Array.isArray(s.default) ? [...s.default] : s.default;
  return out;
}

/**
 * Material builders: recipes that need the buffer-level processing chain
 * (filters/flood-fill/tile-sampler) and therefore return a fully assembled
 * Material rather than per-texel MaterialFields. Same source drives the Node
 * PNG export and the browser viewer.
 */
export interface MaterialBuilderParams {
  seed?: number;
}

/** Tiled ceramic floor: brick layout + bevel relief + per-tile color + grout. */
export function tileFloor(size: number, params: MaterialBuilderParams = {}): Material {
  const seed = params.seed ?? 21;
  const cols = 5;
  const rows = 5;
  const tileOpts = { columns: cols, rows, mortar: 0.04, offset: 0.5, seed };

  const maskTex = generate(size, size, 1, brickMask(tileOpts));
  const tileRandom = floodFillRandom(maskTex, { seed });
  const tileBevel = bevel(maskTex, { width: Math.round(size / 50), smoothing: 1 });

  const height = generate(size, size, 1, (_u, _v, x, y) => {
    const m = sample(maskTex, x, y, 0);
    const b = sample(tileBevel, x, y, 0);
    return m > 0.5 ? 0.35 + b * 0.5 : 0.25;
  });

  const groutNear = distanceField(maskTex, {
    maxDistance: Math.round(size / 20),
    threshold: 0.5,
  });

  const ceramicRamp = ramp([
    { at: 0.0, color: [0.62, 0.66, 0.7] },
    { at: 0.4, color: [0.78, 0.8, 0.8] },
    { at: 0.7, color: [0.86, 0.84, 0.8] },
    { at: 1.0, color: [0.92, 0.9, 0.86] },
  ]);
  const tileColor = gradientMap(levels(tileRandom, { inLow: 0.1, inHigh: 0.9 }), ceramicRamp);

  const speckleMask = tileSampler(size, dots({ scale: 3, radius: 0.35, softness: 0.4 }), {
    count: 22,
    jitter: 0.45,
    scaleRange: [0.4, 1.1],
    valueSpread: 0.6,
    seed: seed + 5,
  });
  const speckleColor = generate(size, size, 3, (_u, _v, x, y) => {
    const s = 1 - sample(speckleMask, x, y, 0) * 0.18;
    return [s, s, s];
  });
  const groutColor = generate(size, size, 3, () => [0.4, 0.38, 0.34]);
  const groutOnly = generate(size, size, 1, (_u, _v, x, y) =>
    sample(maskTex, x, y, 0) < 0.5 ? 1 : 0,
  );

  let baseColor = blendTex(speckleColor, tileColor, { mode: "multiply", opacity: 1 });
  baseColor = blendTex(groutColor, baseColor, { mode: "copy", mask: groutOnly });

  const roughVar = blur(tileRandom, { radius: 4 });
  const roughness = generate(size, size, 1, (_u, _v, x, y) => {
    const isTile = sample(maskTex, x, y, 0) > 0.5;
    const v = sample(roughVar, x, y, 0);
    return isTile ? clamp(0.18 + v * 0.12, 0.04, 1) : 0.85;
  });

  const metallic = generate(size, size, 1, () => 0);
  const aoHeight = aoFromHeight(height, { radius: 6, intensity: 1.2 });
  const ao = generate(size, size, 1, (_u, _v, x, y) => {
    const a = sample(aoHeight, x, y, 0);
    const grout = sample(groutNear, x, y, 0);
    return clamp(a * (1 - grout * 0.35), 0, 1);
  });
  const normal = heightToNormal(height, 3);
  const emission = generate(size, size, 3, () => [0, 0, 0]);

  return { baseColor, metallic, roughness, normal, ao, height, emission };
}

/** Registry of full-Material builders (size-aware, buffer-chain recipes). */
export const MATERIAL_BUILDERS = {
  tileFloor,
} as const;

export type MaterialBuilderName = keyof typeof MATERIAL_BUILDERS;
