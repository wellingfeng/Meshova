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
import { generate, makeTexture, sample } from "./buffer.js";
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
import { clamp, smoothstep, TAU } from "../math/scalar.js";
import { heightToNormal, materialFromFields, type MaterialFields, type Material } from "./pbr.js";
import { applyWeatherStack } from "./weather-stack.js";
import {
  bakedSmartMaterial,
  type BakedSmartMaterialResult,
} from "./baked-smart-material.js";
import {
  createFacadeDemoBake,
  facadeMaterialPipeline,
  type FacadeMaterialPipelineResult,
} from "./facade-material-pipeline.js";
import { controlPanelMaterial } from "./control-panel-material.js";
import {
  architecturalTrimRegions,
  buildTrimSheetPipeline,
  type TrimSheetPipelineResult,
} from "./trim-sheet-pipeline.js";
import {
  applyDecalGlyphSystem,
  type DecalGlyphLayer,
  type DecalGlyphSystemResult,
} from "./decal-glyph-system.js";
import {
  damagedPlasterSystem,
  type DamagedPlasterSystemResult,
} from "./damaged-plaster-system.js";
import {
  woodMaterialSystem,
  type WoodMaterialSystemResult,
} from "./wood-material-system.js";
import {
  wovenFabricSystem,
  type WovenFabricSystemResult,
} from "./woven-fabric-system.js";
import type { GeometryTextureBake } from "./geometry-bake.js";
import { organicCellScales, stylizedCellRock } from "./masterclass-s3.js";
import { sciFiHullHeightSystem } from "./sci-fi-hull.js";
import { sciFiHullMaterialSystem } from "./sci-fi-hull-material.js";

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

export function corrugatedMetal(
  params: PresetParams & {
    color?: [number, number, number];
    ridges?: number;
    amplitude?: number;
    roughness?: number;
    wear?: number;
    dirt?: number;
  } = {},
): MaterialFields {
  const seed = params.seed ?? 31;
  const color = params.color ?? [0.48, 0.5, 0.52];
  const ridges = Math.round(clamp(params.ridges ?? 12, 2, 48));
  const amplitude = clamp(params.amplitude ?? 0.82, 0, 1);
  const roughness = clamp(params.roughness ?? 0.3, 0.04, 0.85);
  const wear = clamp(params.wear ?? 0.28, 0, 1);
  const dirt = clamp(params.dirt ?? 0.18, 0, 1);
  const noise = makeNoise(seed);

  const profile = (u: number, v: number) => {
    const warp = fbm2(noise, v * 1.8, seed * 0.013, { octaves: 3 }) * 0.025;
    return 0.5 + Math.cos((u * ridges + warp) * TAU) * 0.5;
  };
  const brush = (u: number, v: number) =>
    fbm2(noise, u * 96, v * 9, { octaves: 3 }) * 0.5 + 0.5;
  const scratch = (u: number, v: number) => {
    const bend = noise.noise2(v * 4, seed * 0.071) * 1.1;
    const carrier = 0.5 + Math.sin(u * ridges * 17 * TAU + bend + seed * 0.37) * 0.5;
    const gate = fbm2(noise, u * 7 + 19, v * 5 - 11, { octaves: 3 }) * 0.5 + 0.5;
    return smoothstep(0.94, 0.995, carrier) * smoothstep(0.48, 0.78, gate) * wear;
  };
  const valleyDirt = (u: number, v: number) => {
    const valley = smoothstep(0.58, 0.98, 1 - profile(u, v));
    const breakup = fbm2(noise, u * 9 + 31, v * 7 - 17, { octaves: 4 }) * 0.5 + 0.5;
    return valley * (0.42 + breakup * 0.58) * dirt;
  };
  const crestWear = (u: number, v: number) =>
    smoothstep(0.68, 0.98, profile(u, v)) * wear;

  return {
    baseColor: (u, v) => {
      const form = profile(u, v);
      const grain = brush(u, v);
      const scratches = scratch(u, v);
      const dust = valleyDirt(u, v);
      const shade = 0.76 + form * 0.24 + (grain - 0.5) * 0.1 - scratches * 0.16;
      const metal: [number, number, number] = [
        clamp(color[0] * shade, 0, 1),
        clamp(color[1] * shade, 0, 1),
        clamp(color[2] * shade, 0, 1),
      ];
      return blendColor(metal, [0.19, 0.15, 0.1], clamp(dust * 0.9, 0, 1));
    },
    metallic: (u, v) => clamp(1 - valleyDirt(u, v) * 0.9, 0, 1),
    roughness: (u, v) => clamp(
      roughness
        + (brush(u, v) - 0.5) * 0.14
        + scratch(u, v) * 0.34
        + valleyDirt(u, v) * 0.48
        - crestWear(u, v) * 0.12,
      0.04,
      1,
    ),
    ao: (u, v) => clamp(
      1 - smoothstep(0.62, 1, 1 - profile(u, v)) * 0.14 - valleyDirt(u, v) * 0.28,
      0,
      1,
    ),
    height: (u, v) => clamp(
      0.5
        + (profile(u, v) - 0.5) * amplitude * 0.86
        + (brush(u, v) - 0.5) * 0.025
        - scratch(u, v) * 0.035
        + valleyDirt(u, v) * 0.015,
      0,
      1,
    ),
    normalStrength: 5,
  };
}

/** Embossed cast-metal manhole cover blended into rough pavement. */
export function manholeCover(
  params: PresetParams & {
    color?: [number, number, number];
    coverRadius?: number;
    rings?: number;
    spokes?: number;
    relief?: number;
    wear?: number;
    dirt?: number;
    groundBlend?: number;
  } = {},
): MaterialFields {
  const seed = params.seed ?? 43;
  const color = params.color ?? [0.27, 0.29, 0.3];
  const coverRadius = clamp(params.coverRadius ?? 0.39, 0.26, 0.47);
  const rings = Math.round(clamp(params.rings ?? 3, 1, 6));
  const spokes = Math.round(clamp(params.spokes ?? 16, 6, 32));
  const relief = clamp(params.relief ?? 0.72, 0, 1);
  const wear = clamp(params.wear ?? 0.32, 0, 1);
  const dirt = clamp(params.dirt ?? 0.38, 0, 1);
  const groundBlend = clamp(params.groundBlend ?? 0.5, 0, 1);
  const noise = makeNoise(seed);

  const coordinates = (u: number, v: number) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const radius = Math.hypot(x, y);
    return { x, y, radius, normalizedRadius: radius / coverRadius, angle: Math.atan2(y, x) };
  };
  const cover = (u: number, v: number) =>
    smoothstep(coverRadius + 0.004, coverRadius - 0.004, coordinates(u, v).radius);
  const ringRelief = (normalizedRadius: number) => {
    let value = 0;
    for (let index = 0; index < rings; index++) {
      const ringRadius = rings === 1 ? 0.72 : 0.34 + index * (0.47 / (rings - 1));
      value = Math.max(value, smoothstep(0.045, 0.012, Math.abs(normalizedRadius - ringRadius)));
    }
    return value;
  };
  const tread = (x: number, y: number, normalizedRadius: number) => {
    const spacing = coverRadius * 0.18;
    const diagonalA = Math.abs((((x + y) / spacing + 0.5) % 1 + 1) % 1 - 0.5);
    const diagonalB = Math.abs((((x - y) / spacing + 0.5) % 1 + 1) % 1 - 0.5);
    const lines = Math.max(
      smoothstep(0.13, 0.035, diagonalA),
      smoothstep(0.13, 0.035, diagonalB),
    );
    return lines * smoothstep(0.66, 0.58, normalizedRadius);
  };
  const details = (u: number, v: number) => {
    const point = coordinates(u, v);
    const angularDistance = Math.abs(Math.sin(point.angle * spokes * 0.5));
    const ribs = smoothstep(0.17, 0.035, angularDistance)
      * smoothstep(0.2, 0.29, point.normalizedRadius)
      * smoothstep(0.78, 0.7, point.normalizedRadius);
    const boltDistance = Math.hypot(
      (point.normalizedRadius - 0.68) / 0.045,
      angularDistance / 0.13,
    );
    const bolts = smoothstep(1, 0.55, boltDistance);
    const slotDistance = Math.hypot(
      (point.normalizedRadius - 0.88) / 0.035,
      Math.abs(Math.sin((point.angle + Math.PI / spokes) * spokes * 0.5)) / 0.22,
    );
    const slots = smoothstep(1, 0.64, slotDistance);
    const center = smoothstep(0.18, 0.145, point.normalizedRadius);
    const ringsMask = ringRelief(point.normalizedRadius);
    const grid = tread(point.x, point.y, point.normalizedRadius);
    const raised = Math.max(ringsMask, ribs, bolts, center, grid);
    return { ...point, raised, slots, ringsMask, ribs, bolts, grid };
  };
  const pavement = (u: number, v: number) =>
    fbm2(noise, u * 38 + 13, v * 38 - 7, { octaves: 4 }) * 0.5 + 0.5;
  const casting = (u: number, v: number) =>
    fbm2(noise, u * 72 - 17, v * 72 + 23, { octaves: 3 }) * 0.5 + 0.5;
  const edgeGrime = (u: number, v: number) => {
    const point = coordinates(u, v);
    const seam = smoothstep(0.055, 0.008, Math.abs(point.normalizedRadius - 1));
    const breakup = fbm2(noise, u * 14 + 31, v * 14 - 19, { octaves: 4 }) * 0.5 + 0.5;
    return seam * (0.38 + breakup * 0.62) * groundBlend;
  };
  const grime = (u: number, v: number) => {
    const detail = details(u, v);
    const lowRelief = Math.max(detail.slots, (1 - detail.raised) * detail.ringsMask * 0.35);
    const patches = smoothstep(0.5, 0.78, pavement(u + 0.17, v - 0.11));
    return clamp((lowRelief * 0.72 + patches * 0.28) * dirt + edgeGrime(u, v), 0, 1);
  };

  return {
    baseColor: (u, v) => {
      const mask = cover(u, v);
      const detail = details(u, v);
      const cast = casting(u, v);
      const raisedWear = detail.raised * smoothstep(0.48, 0.8, cast) * wear;
      const metalShade = 0.78 + cast * 0.16 + raisedWear * 0.24 - detail.slots * 0.24;
      const metal: [number, number, number] = [
        clamp(color[0] * metalShade, 0, 1),
        clamp(color[1] * metalShade, 0, 1),
        clamp(color[2] * metalShade, 0, 1),
      ];
      const aggregate = pavement(u, v);
      const ground: [number, number, number] = [
        0.105 + aggregate * 0.055,
        0.1 + aggregate * 0.05,
        0.09 + aggregate * 0.045,
      ];
      const dirtyMetal = blendColor(metal, [0.105, 0.075, 0.045], grime(u, v));
      return blendColor(ground, dirtyMetal, mask);
    },
    metallic: (u, v) => clamp(cover(u, v) * (1 - grime(u, v) * 0.92), 0, 1),
    roughness: (u, v) => {
      const mask = cover(u, v);
      const detail = details(u, v);
      const metalRoughness = 0.42
        + (casting(u, v) - 0.5) * 0.16
        + grime(u, v) * 0.42
        - detail.raised * wear * 0.12;
      const groundRoughness = 0.8 + pavement(u, v) * 0.16;
      return clamp(blend(groundRoughness, metalRoughness, mask), 0.04, 1);
    },
    ao: (u, v) => {
      const detail = details(u, v);
      const coverOcclusion = detail.slots * 0.48 + grime(u, v) * 0.28;
      const groundOcclusion = (1 - pavement(u, v)) * 0.08;
      return clamp(1 - blend(groundOcclusion, coverOcclusion, cover(u, v)), 0, 1);
    },
    height: (u, v) => {
      const mask = cover(u, v);
      const detail = details(u, v);
      const groundHeight = 0.18 + (pavement(u, v) - 0.5) * 0.055;
      const coverHeight = 0.55
        + detail.raised * relief * 0.24
        - detail.slots * relief * 0.24
        + (casting(u, v) - 0.5) * 0.018;
      const seam = edgeGrime(u, v) * 0.12;
      return clamp(blend(groundHeight, coverHeight, mask) - seam, 0, 1);
    },
    normalStrength: 5,
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
  params: PresetParams & { color?: [number, number, number]; roughness?: number } = {},
): MaterialFields {
  const seed = params.seed ?? 5;
  const color = params.color ?? [0.85, 0.82, 0.78];
  const roughness = clamp(params.roughness ?? 0.15, 0.04, 1);
  const noise = makeNoise(seed);
  const wave = (u: number, v: number) =>
    fbm2(noise, u * 10, v * 10, { octaves: 3 }) * 0.5 + 0.5;
  return {
    baseColor: () => color,
    metallic: () => 0,
    roughness: (u, v) => clamp(roughness + (wave(u, v) - 0.5) * 0.06, 0.04, 1),
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
  corrugatedMetal,
  manholeCover,
  plushFur,
  ceramic,
  wood,
  brickWall,
  terrain,
  stylizedCellRock,
  organicCellScales,
  sciFiHullHeightSystem,
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
  corrugatedMetal: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 31 },
    { key: "color", label: "金属颜色", type: "rgb", default: [0.48, 0.5, 0.52] },
    { key: "ridges", label: "波纹数量", type: "range", min: 2, max: 48, step: 1, default: 12 },
    { key: "amplitude", label: "波纹深度", type: "range", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 0.85, step: 0.01, default: 0.3 },
    { key: "wear", label: "划痕磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.28 },
    { key: "dirt", label: "谷底积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.18 },
  ],
  manholeCover: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 43 },
    { key: "color", label: "铸铁颜色", type: "rgb", default: [0.27, 0.29, 0.3] },
    { key: "coverRadius", label: "井盖半径", type: "range", min: 0.26, max: 0.47, step: 0.01, default: 0.39 },
    { key: "rings", label: "同心环数", type: "range", min: 1, max: 6, step: 1, default: 3 },
    { key: "spokes", label: "径向肋数", type: "range", min: 6, max: 32, step: 1, default: 16 },
    { key: "relief", label: "浮雕高度", type: "range", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "wear", label: "凸缘磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.32 },
    { key: "dirt", label: "凹槽积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "groundBlend", label: "地面融合", type: "range", min: 0, max: 1, step: 0.02, default: 0.5 },
  ],
  weatherStack: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 61 },
    { key: "wetness", label: "潮湿积水", type: "range", min: 0, max: 1, step: 0.02, default: 0.58 },
    { key: "dirt", label: "污垢积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "rust", label: "金属锈蚀", type: "range", min: 0, max: 1, step: 0.02, default: 0.32 },
    { key: "moss", label: "苔藓覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0.18 },
    { key: "snow", label: "积雪覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0 },
    { key: "scale", label: "天气斑块尺度", type: "range", min: 1, max: 18, step: 0.5, default: 7 },
  ],
  bakedSmartMaterial: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 73 },
    { key: "paintColor", label: "门板漆色", type: "rgb", default: [0.12, 0.28, 0.46] },
    { key: "wear", label: "边缘露底", type: "range", min: 0, max: 1, step: 0.02, default: 0.66 },
    { key: "dirt", label: "凹槽积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.48 },
    { key: "rain", label: "方向雨痕", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "scratches", label: "漆面划痕", type: "range", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "scale", label: "磨损细节尺度", type: "range", min: 2, max: 18, step: 0.5, default: 8 },
  ],
  facadeMaterialPipeline: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 83 },
    { key: "brickColor", label: "立面砖色", type: "rgb", default: [0.48, 0.19, 0.08] },
    { key: "plasterColor", label: "首层灰泥", type: "rgb", default: [0.58, 0.55, 0.48] },
    { key: "wear", label: "边缘磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.48 },
    { key: "grime", label: "凹槽积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "rain", label: "垂直雨痕", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "wetness", label: "整体湿润", type: "range", min: 0, max: 1, step: 0.02, default: 0.22 },
    { key: "weathering", label: "统一风化", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "moss", label: "低处苔藓", type: "range", min: 0, max: 1, step: 0.02, default: 0.12 },
    { key: "snow", label: "高处积雪", type: "range", min: 0, max: 1, step: 0.02, default: 0 },
    { key: "detailScale", label: "表面细节尺度", type: "range", min: 2, max: 18, step: 0.5, default: 8 },
  ],
  controlPanel: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 97 },
    { key: "panelColor", label: "面板漆色", type: "rgb", default: [0.075, 0.12, 0.15] },
    { key: "accentColor", label: "状态强调色", type: "rgb", default: [0.08, 0.82, 0.62] },
    { key: "activeControl", label: "激活控件", type: "range", min: 0, max: 5, step: 1, default: 0 },
    { key: "alarm", label: "故障警报", type: "range", min: 0, max: 1, step: 0.02, default: 0.22 },
    { key: "glow", label: "发光强度", type: "range", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "wear", label: "边缘磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "dirt", label: "凹槽积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.28 },
    { key: "iconScale", label: "图标尺寸", type: "range", min: 0.65, max: 1.35, step: 0.05, default: 1 },
  ],
  trimSheetPipeline: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 40, step: 1, default: 109 },
    { key: "paintColor", label: "框架漆色", type: "rgb", default: [0.14, 0.28, 0.4] },
    { key: "accentColor", label: "边框强调色", type: "rgb", default: [0.52, 0.16, 0.055] },
    { key: "wear", label: "边缘露底", type: "range", min: 0, max: 1, step: 0.02, default: 0.52 },
    { key: "dirt", label: "接缝积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "weathering", label: "统一风化", type: "range", min: 0, max: 1, step: 0.02, default: 0.28 },
    { key: "wetness", label: "湿润程度", type: "range", min: 0, max: 1, step: 0.02, default: 0.08 },
    { key: "moss", label: "苔藓覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0 },
    { key: "detailScale", label: "细节尺度", type: "range", min: 2, max: 18, step: 0.5, default: 9 },
    { key: "fastenerCount", label: "螺栓数量", type: "range", min: 3, max: 20, step: 1, default: 9 },
  ],
  decalGlyphSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 127 },
    { key: "signColor", label: "标牌底色", type: "rgb", default: [0.055, 0.105, 0.145] },
    { key: "decalColor", label: "文字颜色", type: "rgb", default: [0.78, 0.86, 0.86] },
    { key: "accentColor", label: "警告强调色", type: "rgb", default: [0.96, 0.62, 0.045] },
    { key: "peel", label: "贴花剥落", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "grime", label: "边缘污渍", type: "range", min: 0, max: 1, step: 0.02, default: 0.3 },
    { key: "relief", label: "贴花浮雕", type: "range", min: 0, max: 1, step: 0.02, default: 0.46 },
    { key: "glow", label: "发光标识", type: "range", min: 0, max: 1, step: 0.02, default: 0.32 },
  ],
  damagedPlasterSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 149 },
    { key: "plasterColor", label: "灰泥颜色", type: "rgb", default: [0.66, 0.61, 0.51] },
    { key: "brickColor", label: "砖体颜色", type: "rgb", default: [0.48, 0.16, 0.065] },
    { key: "damage", label: "灰泥剥落", type: "range", min: 0, max: 1, step: 0.02, default: 0.58 },
    { key: "cracks", label: "裂缝传播", type: "range", min: 0, max: 1, step: 0.02, default: 0.68 },
    { key: "edgeBreakup", label: "碎边破形", type: "range", min: 0, max: 1, step: 0.02, default: 0.62 },
    { key: "dirt", label: "裂缝积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "brickColumns", label: "横向砖数", type: "range", min: 3, max: 14, step: 1, default: 7 },
    { key: "brickRows", label: "纵向砖数", type: "range", min: 6, max: 24, step: 1, default: 14 },
  ],
  woodMaterialSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 173 },
    { key: "woodColor", label: "早材颜色", type: "rgb", default: [0.52, 0.28, 0.095] },
    { key: "latewoodColor", label: "晚材颜色", type: "rgb", default: [0.24, 0.09, 0.025] },
    { key: "ringScale", label: "年轮密度", type: "range", min: 3, max: 28, step: 1, default: 13 },
    { key: "grainScale", label: "纵纹密度", type: "range", min: 12, max: 96, step: 2, default: 48 },
    { key: "cutDirection", label: "切割方向", type: "range", min: 0, max: 180, step: 5, default: 0 },
    { key: "endGrain", label: "端面权重", type: "range", min: 0, max: 1, step: 0.02, default: 0.18 },
    { key: "varnish", label: "清漆覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "wear", label: "清漆磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "poreDepth", label: "木孔深度", type: "range", min: 0, max: 1, step: 0.02, default: 0.52 },
  ],
  wovenFabricSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 223 },
    { key: "warpColor", label: "经纱颜色", type: "rgb", default: [0.11, 0.22, 0.31] },
    { key: "weftColor", label: "纬纱颜色", type: "rgb", default: [0.49, 0.58, 0.62] },
    { key: "weaveScale", label: "编织密度", type: "range", min: 8, max: 80, step: 2, default: 40 },
    { key: "yarnWidth", label: "纱线宽度", type: "range", min: 0.35, max: 0.98, step: 0.01, default: 0.84 },
    { key: "direction", label: "纤维方向", type: "range", min: 0, max: 180, step: 5, default: 0 },
    { key: "distortion", label: "纱线扰动", type: "range", min: 0, max: 0.45, step: 0.01, default: 0.12 },
    { key: "fiberStrength", label: "微纤维强度", type: "range", min: 0, max: 1, step: 0.02, default: 0.58 },
    { key: "fuzz", label: "表面绒毛", type: "range", min: 0, max: 1, step: 0.02, default: 0.62 },
    { key: "compression", label: "局部压痕", type: "range", min: 0, max: 1, step: 0.02, default: 0.64 },
    { key: "compressionRadius", label: "压痕范围", type: "range", min: 0.06, max: 0.55, step: 0.01, default: 0.24 },
    { key: "wear", label: "纤维磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.2 },
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
  stylizedCellRock: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 307 },
    { key: "cells", label: "岩块密度", type: "range", min: 2, max: 18, step: 1, default: 7 },
    { key: "jitter", label: "岩块不规则度", type: "range", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "heightLevels", label: "高度色阶", type: "range", min: 2, max: 8, step: 1, default: 4 },
    { key: "crackWidth", label: "裂缝宽度", type: "range", min: 0.025, max: 0.3, step: 0.005, default: 0.11 },
    { key: "crackDepth", label: "裂缝深度", type: "range", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "bevel", label: "岩块倒角", type: "range", min: 0.02, max: 0.4, step: 0.01, default: 0.12 },
    { key: "distortion", label: "轮廓破形", type: "range", min: 0, max: 1.5, step: 0.03, default: 0.72 },
    { key: "damage", label: "边缘损坏", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    { key: "moss", label: "苔藓总量", type: "range", min: 0, max: 1, step: 0.02, default: 0.62 },
    { key: "topMoss", label: "顶面苔藓", type: "range", min: 0, max: 1, step: 0.02, default: 0.46 },
    { key: "microDetail", label: "岩面微粒", type: "range", min: 0, max: 1, step: 0.02, default: 0.24 },
    { key: "mossColor", label: "苔藓颜色", type: "rgb", default: [0.2, 0.36, 0.11] },
  ],
  organicCellScales: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 419 },
    { key: "cells", label: "鳞片密度", type: "range", min: 2, max: 24, step: 1, default: 10 },
    { key: "aspectRatio", label: "鳞片长宽比", type: "range", min: 0.5, max: 2.5, step: 0.05, default: 1.35 },
    { key: "regularity", label: "排列规则度", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "roundness", label: "轮廓圆润度", type: "range", min: 0, max: 1, step: 0.02, default: 0.68 },
    { key: "scaleVariation", label: "尺寸变化", type: "range", min: 0, max: 0.65, step: 0.01, default: 0.3 },
    { key: "heightVariation", label: "高度变化", type: "range", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "slope", label: "鳞片局部坡度", type: "range", min: 0, max: 1, step: 0.02, default: 0.48 },
    { key: "crackWidth", label: "缝隙宽度", type: "range", min: 0.02, max: 0.24, step: 0.005, default: 0.085 },
    { key: "crackVariation", label: "缝隙宽度变化", type: "range", min: 0, max: 1, step: 0.02, default: 0.5 },
    { key: "edgeDamage", label: "边缘破损", type: "range", min: 0, max: 1, step: 0.02, default: 0.36 },
    { key: "deposition", label: "凹缝沉积", type: "range", min: 0, max: 1, step: 0.02, default: 0.52 },
    { key: "microDamage", label: "表面微损伤", type: "range", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "baseColor", label: "鳞片基色", type: "rgb", default: [0.16, 0.27, 0.25] },
    { key: "accentColor", label: "鳞片变化色", type: "rgb", default: [0.46, 0.62, 0.43] },
  ],
  sciFiHullHeightSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 733 },
    { key: "panelColumns", label: "面板列数", type: "range", min: 2, max: 9, step: 1, default: 5 },
    { key: "panelRows", label: "面板行数", type: "range", min: 2, max: 8, step: 1, default: 4 },
    { key: "seamWidth", label: "接缝宽度", type: "range", min: 0.003, max: 0.04, step: 0.001, default: 0.012 },
    { key: "seamDepth", label: "接缝深度", type: "range", min: 0, max: 0.4, step: 0.01, default: 0.18 },
    { key: "panelVariation", label: "面板变化", type: "range", min: 0, max: 1, step: 0.02, default: 0.52 },
    { key: "coverPlateHeight", label: "覆盖板高度", type: "range", min: 0.02, max: 0.24, step: 0.01, default: 0.1 },
    { key: "hatchRadius", label: "舱口半径", type: "range", min: 0.08, max: 0.18, step: 0.005, default: 0.13 },
    { key: "turbineBlades", label: "涡轮叶片数", type: "range", min: 4, max: 24, step: 1, default: 12 },
    { key: "ventSlats", label: "通风叶片数", type: "range", min: 3, max: 16, step: 1, default: 7 },
    { key: "pipeWidth", label: "管线宽度", type: "range", min: 0.006, max: 0.035, step: 0.001, default: 0.014 },
    { key: "detailDensity", label: "细节密度", type: "range", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "emission", label: "发光强度", type: "range", min: 0, max: 1, step: 0.02, default: 0.85 },
    { key: "hullColor", label: "船壳主色", type: "rgb", default: [0.055, 0.075, 0.095] },
    { key: "accentColor", label: "覆盖板颜色", type: "rgb", default: [0.12, 0.28, 0.36] },
    { key: "emissionColor", label: "发光颜色", type: "rgb", default: [0.02, 0.72, 0.92] },
  ],
  sciFiHullMaterialSystem: [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: 733 },
    { key: "panelColumns", label: "面板列数", type: "range", min: 2, max: 9, step: 1, default: 5 },
    { key: "panelRows", label: "面板行数", type: "range", min: 2, max: 8, step: 1, default: 4 },
    { key: "seamWidth", label: "接缝宽度", type: "range", min: 0.003, max: 0.04, step: 0.001, default: 0.012 },
    { key: "detailDensity", label: "机械细节密度", type: "range", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "paintCoverage", label: "喷漆覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0.88 },
    { key: "edgeWear", label: "边缘磨损", type: "range", min: 0, max: 1, step: 0.02, default: 0.58 },
    { key: "scratchDensity", label: "划痕密度", type: "range", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "scratchDirection", label: "划痕方向", type: "range", min: -90, max: 90, step: 1, default: 8 },
    { key: "scratchScale", label: "划痕频率", type: "range", min: 8, max: 120, step: 1, default: 54 },
    { key: "rust", label: "锈蚀", type: "range", min: 0, max: 1, step: 0.02, default: 0.46 },
    { key: "oil", label: "油污泄漏", type: "range", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "dust", label: "凹腔积尘", type: "range", min: 0, max: 1, step: 0.02, default: 0.4 },
    { key: "rain", label: "雨痕", type: "range", min: 0, max: 1, step: 0.02, default: 0.3 },
    { key: "emission", label: "发光强度", type: "range", min: 0, max: 1, step: 0.02, default: 0.85 },
    { key: "emissionGlow", label: "发光泛光", type: "range", min: 0, max: 1, step: 0.02, default: 0.48 },
    { key: "normalStrength", label: "法线强度", type: "range", min: 0, max: 16, step: 0.25, default: 7 },
    { key: "paintColor", label: "主喷漆颜色", type: "rgb", default: [0.055, 0.11, 0.14] },
    { key: "accentPaintColor", label: "强调喷漆颜色", type: "rgb", default: [0.12, 0.34, 0.42] },
    { key: "bareMetalColor", label: "裸露金属颜色", type: "rgb", default: [0.34, 0.38, 0.4] },
    { key: "rustColor", label: "锈蚀颜色", type: "rgb", default: [0.42, 0.12, 0.025] },
    { key: "emissionColor", label: "发光颜色", type: "rgb", default: [0.02, 0.72, 0.92] },
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

export interface WeatherStackMaterialParams extends MaterialBuilderParams {
  wetness?: number;
  dirt?: number;
  rust?: number;
  moss?: number;
  snow?: number;
  scale?: number;
}

/** Multi-state weathering demo built on one embossed metal-and-pavement base. */
export function weatherStackMaterial(
  size: number,
  params: WeatherStackMaterialParams = {},
): Material {
  const seed = params.seed ?? 61;
  const base = materialFromFields(size, manholeCover({
    seed,
    wear: 0.26,
    dirt: 0,
    groundBlend: 0.28,
  }));
  return applyWeatherStack(base, {
    seed: seed + 101,
    wetness: params.wetness ?? 0.58,
    dirt: params.dirt ?? 0.34,
    rust: params.rust ?? 0.32,
    moss: params.moss ?? 0.18,
    snow: params.snow ?? 0,
    scale: params.scale ?? 7,
  }).material;
}

export interface PaintedMetalPanelParams extends MaterialBuilderParams {
  paintColor?: [number, number, number];
  wear?: number;
  dirt?: number;
  rain?: number;
  scratches?: number;
  scale?: number;
}

export function paintedMetalPanelSmartMaterial(
  size: number,
  params: PaintedMetalPanelParams = {},
): BakedSmartMaterialResult {
  const seed = params.seed ?? 73;
  const paintColor = params.paintColor ?? [0.12, 0.28, 0.46];
  const frameColor: [number, number, number] = [
    paintColor[0] * 0.48,
    paintColor[1] * 0.48,
    paintColor[2] * 0.48,
  ];
  const exposedSteel = { color: [0.42, 0.44, 0.45] as const, metallic: 1, roughness: 0.28 };
  return bakedSmartMaterial(createPaintedMetalPanelBake(size), [
    { materialId: 0, color: paintColor, metallic: 0, roughness: 0.34, underlayer: exposedSteel },
    { materialId: 1, color: frameColor, metallic: 0, roughness: 0.42, underlayer: exposedSteel },
    { materialId: 2, color: [0.32, 0.34, 0.35], metallic: 1, roughness: 0.26 },
  ], {
    seed,
    wear: params.wear ?? 0.66,
    dirt: params.dirt ?? 0.48,
    rain: params.rain ?? 0.38,
    scratches: params.scratches ?? 0.42,
    scale: params.scale ?? 8,
    normalStrength: 7,
  });
}

export function paintedMetalPanelMaterial(
  size: number,
  params: PaintedMetalPanelParams = {},
): Material {
  return paintedMetalPanelSmartMaterial(size, params).material;
}

export interface FacadeMaterialPipelineParams extends MaterialBuilderParams {
  brickColor?: [number, number, number];
  plasterColor?: [number, number, number];
  wear?: number;
  grime?: number;
  rain?: number;
  wetness?: number;
  weathering?: number;
  moss?: number;
  snow?: number;
  detailScale?: number;
}

export function facadeMaterialPipelineResult(
  size: number,
  params: FacadeMaterialPipelineParams = {},
): FacadeMaterialPipelineResult {
  const seed = params.seed ?? 83;
  const weathering = clamp(params.weathering ?? 0.38, 0, 1);
  return facadeMaterialPipeline(createFacadeDemoBake(size), [
    {
      materialId: 0,
      role: "masonry",
      color: params.brickColor ?? [0.48, 0.19, 0.08],
      roughness: 0.82,
    },
    {
      materialId: 1,
      role: "plaster",
      color: params.plasterColor ?? [0.58, 0.55, 0.48],
      roughness: 0.76,
    },
    { materialId: 2, role: "metal", color: [0.25, 0.28, 0.3], metallic: 1, roughness: 0.3 },
    {
      materialId: 3,
      role: "glass",
      color: [0.055, 0.12, 0.17],
      roughness: 0.12,
      emission: [0.012, 0.026, 0.04],
    },
    { materialId: 4, role: "trim", color: [0.52, 0.5, 0.45], roughness: 0.68 },
  ], {
    seed,
    wear: params.wear ?? 0.48,
    grime: params.grime ?? 0.42,
    rain: params.rain ?? 0.34,
    detailScale: params.detailScale ?? 8,
    normalStrength: 6,
    weather: {
      seed: seed + 101,
      wetness: params.wetness ?? 0.22,
      dirt: weathering * 0.52,
      rust: weathering * 0.68,
      moss: params.moss ?? 0.12,
      snow: params.snow ?? 0,
      scale: params.detailScale ?? 8,
    },
  });
}

export function facadeMaterialPipelineMaterial(
  size: number,
  params: FacadeMaterialPipelineParams = {},
): Material {
  return facadeMaterialPipelineResult(size, params).material;
}

export interface TrimSheetPipelineParams extends MaterialBuilderParams {
  paintColor?: [number, number, number];
  accentColor?: [number, number, number];
  wear?: number;
  dirt?: number;
  weathering?: number;
  wetness?: number;
  moss?: number;
  detailScale?: number;
  fastenerCount?: number;
}

export function trimSheetPipelineResult(
  size: number,
  params: TrimSheetPipelineParams = {},
): TrimSheetPipelineResult {
  const seed = params.seed ?? 109;
  const weathering = clamp(params.weathering ?? 0.28, 0, 1);
  return buildTrimSheetPipeline(size, architecturalTrimRegions({
    paintColor: params.paintColor ?? [0.14, 0.28, 0.4],
    accentColor: params.accentColor ?? [0.52, 0.16, 0.055],
  }), {
    seed,
    gutter: 0.04,
    wear: params.wear ?? 0.52,
    dirt: params.dirt ?? 0.34,
    detailScale: params.detailScale ?? 9,
    fastenerCount: params.fastenerCount ?? 9,
    normalStrength: 7,
    weather: {
      seed: seed + 101,
      wetness: params.wetness ?? 0.08,
      dirt: weathering * 0.38,
      rust: weathering * 0.64,
      moss: params.moss ?? 0,
      snow: 0,
      scale: params.detailScale ?? 9,
      normalStrength: 7,
    },
  });
}

export function trimSheetPipelineMaterial(
  size: number,
  params: TrimSheetPipelineParams = {},
): Material {
  return trimSheetPipelineResult(size, params).material;
}

export interface DecalGlyphSystemParams extends MaterialBuilderParams {
  signColor?: [number, number, number];
  decalColor?: [number, number, number];
  accentColor?: [number, number, number];
  peel?: number;
  grime?: number;
  relief?: number;
  glow?: number;
}

export function decalGlyphSystemResult(
  size: number,
  params: DecalGlyphSystemParams = {},
): DecalGlyphSystemResult {
  const resolution = Math.floor(size);
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error("decal glyph system size must be an integer >= 16");
  }
  const seed = params.seed ?? 127;
  const decalColor = params.decalColor ?? [0.78, 0.86, 0.86];
  const accentColor = params.accentColor ?? [0.96, 0.62, 0.045];
  const relief = clamp(params.relief ?? 0.46, 0, 1);
  const glow = clamp(params.glow ?? 0.32, 0, 1);
  const layers: readonly DecalGlyphLayer[] = [
    {
      id: "brand-title",
      label: "品牌文字",
      kind: "text",
      text: "MESHOVA",
      center: [0.5, 0.76],
      size: [0.72, 0.14],
      color: decalColor,
      roughness: 0.48,
      height: relief * 0.014,
      age: 0.18,
    },
    {
      id: "asset-number",
      label: "资产编号",
      kind: "text",
      text: "A-17",
      center: [0.48, 0.56],
      size: [0.3, 0.11],
      color: accentColor,
      roughness: 0.5,
      height: relief * 0.012,
      age: 0.34,
    },
    {
      id: "warning-mark",
      label: "高压警告",
      kind: "icon",
      icon: "warning",
      center: [0.24, 0.29],
      size: [0.2, 0.2],
      color: accentColor,
      roughness: 0.44,
      height: relief * 0.016,
      emission: glow,
      age: 0.2,
    },
    {
      id: "inspection-sticker",
      label: "检验贴纸",
      kind: "sticker",
      shape: "rounded",
      text: "QA",
      center: [0.66, 0.3],
      size: [0.27, 0.17],
      rotation: -0.08,
      color: [0.78, 0.86, 0.18],
      foregroundColor: [0.035, 0.05, 0.045],
      roughness: 0.38,
      height: relief * 0.028,
      age: 0.78,
    },
    {
      id: "lower-grime",
      label: "底部污渍",
      kind: "stain",
      center: [0.48, 0.1],
      size: [0.82, 0.2],
      color: [0.075, 0.052, 0.03],
      opacity: clamp(params.grime ?? 0.3, 0, 1),
      roughness: 0.9,
      spread: 0.72,
    },
  ];
  return applyDecalGlyphSystem(createDecalDemoBaseMaterial(resolution, seed, params.signColor ?? [0.055, 0.105, 0.145]), layers, {
    seed,
    peel: params.peel ?? 0.38,
    grime: params.grime ?? 0.3,
    normalStrength: 6,
  });
}

export function decalGlyphSystemMaterial(
  size: number,
  params: DecalGlyphSystemParams = {},
): Material {
  return decalGlyphSystemResult(size, params).material;
}

export interface DamagedPlasterSystemParams extends MaterialBuilderParams {
  plasterColor?: [number, number, number];
  brickColor?: [number, number, number];
  damage?: number;
  cracks?: number;
  edgeBreakup?: number;
  dirt?: number;
  brickColumns?: number;
  brickRows?: number;
}

export function damagedPlasterSystemResult(
  size: number,
  params: DamagedPlasterSystemParams = {},
): DamagedPlasterSystemResult {
  return damagedPlasterSystem(size, {
    seed: params.seed ?? 149,
    plasterColor: params.plasterColor ?? [0.66, 0.61, 0.51],
    brickColor: params.brickColor ?? [0.48, 0.16, 0.065],
    damage: params.damage ?? 0.58,
    cracks: params.cracks ?? 0.68,
    edgeBreakup: params.edgeBreakup ?? 0.62,
    dirt: params.dirt ?? 0.38,
    brickColumns: params.brickColumns ?? 7,
    brickRows: params.brickRows ?? 14,
    normalStrength: 7,
  });
}

export function damagedPlasterSystemMaterial(
  size: number,
  params: DamagedPlasterSystemParams = {},
): Material {
  return damagedPlasterSystemResult(size, params).material;
}

export interface WoodMaterialSystemParams extends MaterialBuilderParams {
  woodColor?: [number, number, number];
  latewoodColor?: [number, number, number];
  ringScale?: number;
  grainScale?: number;
  cutDirection?: number;
  endGrain?: number;
  varnish?: number;
  wear?: number;
  poreDepth?: number;
}

export function woodMaterialSystemResult(
  size: number,
  params: WoodMaterialSystemParams = {},
): WoodMaterialSystemResult {
  return woodMaterialSystem(size, {
    seed: params.seed ?? 173,
    woodColor: params.woodColor ?? [0.52, 0.28, 0.095],
    latewoodColor: params.latewoodColor ?? [0.24, 0.09, 0.025],
    ringScale: params.ringScale ?? 13,
    grainScale: params.grainScale ?? 48,
    cutDirection: params.cutDirection ?? 0,
    endGrain: params.endGrain ?? 0.18,
    varnish: params.varnish ?? 0.72,
    wear: params.wear ?? 0.34,
    poreDepth: params.poreDepth ?? 0.52,
    normalStrength: 7,
  });
}

export function woodMaterialSystemMaterial(
  size: number,
  params: WoodMaterialSystemParams = {},
): Material {
  return woodMaterialSystemResult(size, params).material;
}

export interface WovenFabricSystemParams extends MaterialBuilderParams {
  warpColor?: [number, number, number];
  weftColor?: [number, number, number];
  weaveScale?: number;
  yarnWidth?: number;
  direction?: number;
  distortion?: number;
  fiberStrength?: number;
  fuzz?: number;
  compression?: number;
  compressionRadius?: number;
  wear?: number;
}

export function wovenFabricSystemResult(
  size: number,
  params: WovenFabricSystemParams = {},
): WovenFabricSystemResult {
  return wovenFabricSystem(size, {
    seed: params.seed ?? 223,
    pattern: "herringbone",
    warpColor: params.warpColor ?? [0.11, 0.22, 0.31],
    weftColor: params.weftColor ?? [0.49, 0.58, 0.62],
    weaveScale: params.weaveScale ?? 40,
    yarnWidth: params.yarnWidth ?? 0.84,
    direction: params.direction ?? 0,
    distortion: params.distortion ?? 0.12,
    fiberStrength: params.fiberStrength ?? 0.58,
    fuzz: params.fuzz ?? 0.62,
    compression: params.compression ?? 0.64,
    compressionRadius: params.compressionRadius ?? 0.24,
    wear: params.wear ?? 0.2,
    normalStrength: 6,
  });
}

export function wovenFabricSystemMaterial(
  size: number,
  params: WovenFabricSystemParams = {},
): Material {
  return wovenFabricSystemResult(size, params).material;
}

function createDecalDemoBaseMaterial(
  size: number,
  seed: number,
  signColor: readonly [number, number, number],
): Material {
  const noise = makeNoise(seed + 509);
  return materialFromFields(size, {
    baseColor: (u, v) => {
      const variation = fbm2(noise, u * 18, v * 18, { octaves: 3 }) * 0.035;
      return [
        clamp(signColor[0] + variation, 0, 1),
        clamp(signColor[1] + variation, 0, 1),
        clamp(signColor[2] + variation, 0, 1),
      ];
    },
    metallic: () => 0.82,
    roughness: (u, v) => clamp(0.34 + fbm2(noise, u * 34 + 7, v * 34 - 5, { octaves: 2 }) * 0.05, 0.2, 0.6),
    ao: (u, v) => {
      const borderDistance = Math.min(u, 1 - u, v, 1 - v);
      return clamp(0.82 + smoothstep(0.015, 0.08, borderDistance) * 0.18, 0, 1);
    },
    height: (u, v) => {
      const borderDistance = Math.min(u, 1 - u, v, 1 - v);
      const frame = 1 - smoothstep(0.035, 0.075, borderDistance);
      const rivet = Math.max(
        1 - smoothstep(0.015, 0.026, Math.hypot(u - 0.065, v - 0.065)),
        1 - smoothstep(0.015, 0.026, Math.hypot(u - 0.935, v - 0.065)),
        1 - smoothstep(0.015, 0.026, Math.hypot(u - 0.065, v - 0.935)),
        1 - smoothstep(0.015, 0.026, Math.hypot(u - 0.935, v - 0.935)),
      );
      return 0.48 + frame * 0.035 + rivet * 0.075;
    },
    normalStrength: 5,
  });
}

function createPaintedMetalPanelBake(size: number): GeometryTextureBake {
  const resolution = Math.max(16, Math.floor(size));
  const height = makeTexture(resolution, resolution, 1);
  const id = makeTexture(resolution, resolution, 1);
  const materialId = makeTexture(resolution, resolution, 1);
  const position = makeTexture(resolution, resolution, 3);
  const normal = makeTexture(resolution, resolution, 3);
  const thickness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const curvature = makeTexture(resolution, resolution, 1);
  const coverage = makeTexture(resolution, resolution, 1);

  for (let y = 0; y < resolution; y++) {
    const v = 1 - (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + 0.5) / resolution;
      const pixel = y * resolution + x;
      const borderDistance = Math.min(u, 1 - u, v, 1 - v);
      const frame = borderDistance < 0.115;
      const handle = Math.abs(u - 0.5) < 0.14 && Math.abs(v - 0.53) < 0.045;
      const rivetDistance = Math.min(
        Math.hypot(u - 0.16, v - 0.16),
        Math.hypot(u - 0.84, v - 0.16),
        Math.hypot(u - 0.16, v - 0.84),
        Math.hypot(u - 0.84, v - 0.84),
      );
      const rivet = rivetDistance < 0.022;
      const hardware = handle || rivet;
      const frameEdge = 1 - smoothstep(0.006, 0.022, Math.abs(borderDistance - 0.115));
      const seam = 1 - smoothstep(0.004, 0.016, Math.abs(v - 0.5));
      const handleEdge = handle
        ? 1 - smoothstep(0.004, 0.018, Math.min(0.14 - Math.abs(u - 0.5), 0.045 - Math.abs(v - 0.53)))
        : 0;
      const rivetEdge = 1 - smoothstep(0.003, 0.012, Math.abs(rivetDistance - 0.022));
      const cavity = clamp(frameEdge * 0.72 + seam * 0.46, 0, 1);
      const materialIndex = hardware ? 2 : frame ? 1 : 0;
      height.data[pixel] = clamp(0.46 + (frame ? 0.055 : 0) + (hardware ? 0.08 : 0) - cavity * 0.035, 0, 1);
      id.data[pixel] = materialIndex / 2;
      materialId.data[pixel] = materialIndex / 2;
      position.data[pixel * 3] = u;
      position.data[pixel * 3 + 1] = v;
      position.data[pixel * 3 + 2] = height.data[pixel]!;
      normal.data[pixel * 3] = 0.5;
      normal.data[pixel * 3 + 1] = 0.5;
      normal.data[pixel * 3 + 2] = 1;
      thickness.data[pixel] = 0.8;
      ao.data[pixel] = clamp(1 - cavity * 0.68, 0, 1);
      curvature.data[pixel] = clamp(frameEdge * 0.72 + handleEdge + rivetEdge, 0, 1);
      coverage.data[pixel] = 1;
    }
  }

  return {
    height,
    id,
    materialId,
    position,
    normal,
    worldNormal: normal,
    thickness,
    ao,
    curvature,
    coverage,
    idRange: [0, 2],
    materialIdRange: [0, 2],
  };
}

/** Registry of full-Material builders (size-aware, buffer-chain recipes). */
export const MATERIAL_BUILDERS = {
  tileFloor,
  weatherStack: weatherStackMaterial,
  bakedSmartMaterial: paintedMetalPanelMaterial,
  facadeMaterialPipeline: facadeMaterialPipelineMaterial,
  controlPanel: controlPanelMaterial,
  trimSheetPipeline: trimSheetPipelineMaterial,
  decalGlyphSystem: decalGlyphSystemMaterial,
  damagedPlasterSystem: damagedPlasterSystemMaterial,
  sciFiHullMaterialSystem,
  woodMaterialSystem: woodMaterialSystemMaterial,
  wovenFabricSystem: wovenFabricSystemMaterial,
} as const;

export type MaterialBuilderName = keyof typeof MATERIAL_BUILDERS;
