import { clamp } from "../math/scalar.js";
import type { MaterialFields } from "./pbr.js";

export const TEXTILE_PATTERNS = [
  "plain",
  "twill",
  "herringbone",
  "basket",
  "satin",
  "denim",
  "chevron",
  "pinstripe",
] as const;

export type TextilePattern = (typeof TEXTILE_PATTERNS)[number];

export interface TextileParams {
  pattern?: TextilePattern;
  seed?: number;
  color?: [number, number, number];
  secondaryColor?: [number, number, number];
  scale?: number;
  distortion?: number;
  fiberStrength?: number;
  wear?: number;
  repeat?: number;
  yarnWidth?: number;
}

interface TextileSurfaceSample {
  color: [number, number, number];
  height: number;
  roughness: number;
  ao: number;
}

export interface WovenTextileSample extends TextileSurfaceSample {
  warpProfile: number;
  weftProfile: number;
  warpVisible: boolean;
  weftVisible: boolean;
  warpOver: boolean;
  coverage: number;
  crossing: number;
}

const TAU = Math.PI * 2;

function fract(value: number): number {
  return value - Math.floor(value);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hash01(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

function periodicWarp(u: number, v: number, seed: number): number {
  const phase0 = hash01(seed) * TAU;
  const phase1 = hash01(seed + 1) * TAU;
  const phase2 = hash01(seed + 2) * TAU;
  return (
    Math.sin(TAU * u * 2 + phase0) * Math.cos(TAU * v * 3 + phase1) * 0.55 +
    Math.sin(TAU * u * 5 + phase1) * Math.cos(TAU * v * 4 + phase2) * 0.3 +
    Math.sin(TAU * u * 9 + phase2) * Math.cos(TAU * v * 7 + phase0) * 0.15
  );
}

function yarnProfile(value: number, width: number): number {
  const distance = Math.abs(fract(value) - 0.5) / (width * 0.5);
  if (distance >= 1) return 0;
  return Math.pow(Math.sin((1 - distance) * Math.PI * 0.5), 0.72);
}

function patternPeriod(pattern: TextilePattern, repeat: number): number {
  if (pattern === "satin") return 5;
  if (pattern === "herringbone" || pattern === "chevron") return repeat * 2;
  if (pattern === "basket" || pattern === "twill" || pattern === "denim") return 4;
  if (pattern === "pinstripe") return repeat % 2 === 0 ? repeat : repeat * 2;
  return 2;
}

function quantizedScale(scale: number, period: number): number {
  return Math.max(period, Math.round(scale / period) * period);
}

function warpIsOver(
  pattern: TextilePattern,
  x: number,
  y: number,
  repeat: number,
): boolean {
  if (pattern === "basket") {
    return modulo(Math.floor(x / 2) + Math.floor(y / 2), 2) === 0;
  }
  if (pattern === "satin") {
    return modulo(y - x * 2, 5) !== 0;
  }
  if (pattern === "denim") {
    return modulo(x - y, 4) !== 0;
  }
  if (pattern === "twill") {
    return modulo(x - y, 4) < 2;
  }
  if (pattern === "herringbone") {
    const band = Math.floor(x / repeat);
    const localX = modulo(x, repeat);
    const diagonal = band % 2 === 0 ? y - localX : y + localX;
    return modulo(diagonal, 4) < 2;
  }
  if (pattern === "chevron") {
    const period = repeat * 2;
    const localX = modulo(x, period);
    const zigzag = localX < repeat ? localX : period - 1 - localX;
    return modulo(y - zigzag, 4) < 2;
  }
  return modulo(x + y, 2) === 0;
}

function scaleColor(
  color: [number, number, number],
  scalar: number,
): [number, number, number] {
  return [
    clamp(color[0] * scalar, 0, 1),
    clamp(color[1] * scalar, 0, 1),
    clamp(color[2] * scalar, 0, 1),
  ];
}

function defaultColors(
  pattern: TextilePattern,
): [[number, number, number], [number, number, number]] {
  if (pattern === "denim") return [[0.055, 0.16, 0.34], [0.52, 0.58, 0.62]];
  if (pattern === "pinstripe") return [[0.055, 0.065, 0.085], [0.62, 0.64, 0.68]];
  if (pattern === "satin") return [[0.46, 0.075, 0.16], [0.66, 0.16, 0.27]];
  return [[0.38, 0.33, 0.28], [0.52, 0.47, 0.4]];
}

export function sampleWovenTextile(
  u: number,
  v: number,
  params: TextileParams = {},
): WovenTextileSample {
  const pattern = params.pattern ?? "herringbone";
  const seed = params.seed ?? 211;
  const repeat = Math.max(2, Math.round(params.repeat ?? 4));
  const period = patternPeriod(pattern, repeat);
  const scale = quantizedScale(Math.max(4, params.scale ?? 48), period);
  const distortion = clamp(params.distortion ?? 0.16, 0, 0.45);
  const fiberStrength = clamp(params.fiberStrength ?? 0.45, 0, 1);
  const wear = clamp(params.wear ?? 0.12, 0, 1);
  const yarnWidth = clamp(params.yarnWidth ?? 0.84, 0.35, 0.98);
  const defaults = defaultColors(pattern);
  const warpBase = params.color ?? defaults[0];
  const weftBase = params.secondaryColor ?? defaults[1];

  const x = u * scale + periodicWarp(u, v, seed) * distortion;
  const y = v * scale + periodicWarp(u, v, seed + 17) * distortion;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const warpProfile = yarnProfile(x, yarnWidth);
  const weftProfile = yarnProfile(y, yarnWidth);
  const warpOver = warpIsOver(pattern, cellX, cellY, repeat);
  const warpVisible = warpProfile > 0 && (weftProfile === 0 || warpOver);
  const weftVisible = weftProfile > 0 && (warpProfile === 0 || !warpOver);

  let warpColor = warpBase;
  let weftColor = weftBase;
  if (pattern === "pinstripe") {
    const stripe = modulo(cellX, repeat) === 0;
    warpColor = stripe ? weftBase : warpBase;
    weftColor = scaleColor(warpBase, 0.86);
  }

  const fiberPhase = hash01(seed + 29) * TAU;
  const warpFiber = Math.sin(TAU * v * scale * 3 + fiberPhase + Math.sin(TAU * u * 5) * 0.3);
  const weftFiber = Math.sin(TAU * u * scale * 3 + fiberPhase * 1.37 + Math.sin(TAU * v * 5) * 0.3);
  const fiber = warpVisible ? warpFiber : weftFiber;
  const topProfile = warpVisible ? warpProfile : weftVisible ? weftProfile : 0;
  const bottomProfile = warpVisible ? weftProfile : warpProfile;
  const coverage = Math.max(warpProfile, weftProfile);
  const crossing = Math.min(warpProfile, weftProfile);
  const wearNoise = periodicWarp(u, v, seed + 41) * 0.5 + 0.5;
  const baseColor = warpVisible ? warpColor : weftVisible ? weftColor : scaleColor(warpBase, 0.2);
  const yarnShade = 0.68 + topProfile * 0.28 + fiber * fiberStrength * 0.055;
  const wornShade = 1 + (wearNoise - 0.5) * wear * 0.28;
  const gapShade = 0.35 + coverage * 0.65;
  const color = scaleColor(baseColor, yarnShade * wornShade * gapShade);

  const baseRoughness = pattern === "satin" ? 0.42 : pattern === "denim" ? 0.78 : 0.86;
  const roughness = clamp(
    baseRoughness + (1 - coverage) * 0.08 + fiber * fiberStrength * 0.035 + wearNoise * wear * 0.08,
    0.04,
    1,
  );
  const height = clamp(
    0.08 + Math.max(topProfile, bottomProfile * 0.52) * 0.78 + crossing * 0.06 + fiber * fiberStrength * 0.025,
    0,
    1,
  );
  const ao = clamp(0.48 + coverage * 0.5 - crossing * 0.08, 0, 1);
  return {
    color,
    height,
    roughness,
    ao,
    warpProfile,
    weftProfile,
    warpVisible,
    weftVisible,
    warpOver,
    coverage,
    crossing,
  };
}

export function wovenTextileFields(params: TextileParams = {}): MaterialFields {
  return {
    baseColor: (u, v) => sampleWovenTextile(u, v, params).color,
    metallic: () => 0,
    roughness: (u, v) => sampleWovenTextile(u, v, params).roughness,
    ao: (u, v) => sampleWovenTextile(u, v, params).ao,
    height: (u, v) => sampleWovenTextile(u, v, params).height,
    normalStrength: 3.2,
  };
}

type PatternParams = Omit<TextileParams, "pattern">;

export const plainWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "plain" });
export const twillWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "twill" });
export const herringboneWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "herringbone" });
export const basketWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "basket" });
export const satinWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "satin" });
export const denimWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "denim" });
export const chevronWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "chevron" });
export const pinstripeWeave = (params: PatternParams = {}): MaterialFields =>
  wovenTextileFields({ ...params, pattern: "pinstripe" });

export const TEXTILE_LIBRARY = {
  plainWeave,
  twillWeave,
  herringboneWeave,
  basketWeave,
  satinWeave,
  denimWeave,
  chevronWeave,
  pinstripeWeave,
} as const;

export const DECORATIVE_TEXTILE_STYLES = [
  "jacquard",
  "brocade",
  "lace",
  "ribKnit",
  "corduroy",
  "mesh",
  "twistedRope",
  "pleatedSilk",
] as const;

export type DecorativeTextileStyle = (typeof DECORATIVE_TEXTILE_STYLES)[number];

export interface DecorativeTextileParams {
  style?: DecorativeTextileStyle;
  seed?: number;
  color?: [number, number, number];
  secondaryColor?: [number, number, number];
  accentColor?: [number, number, number];
  scale?: number;
  repeat?: number;
  distortion?: number;
  fiberStrength?: number;
  wear?: number;
  openness?: number;
  relief?: number;
}

export interface YarnLayerParams {
  /** Integer UV lattice direction across the yarn. Integer values preserve tiling. */
  direction: [number, number];
  count: number;
  width: number;
  seed?: number;
  phase?: number;
  distortion?: number;
  twist?: number;
}

export interface YarnLayerSample {
  profile: number;
  fiber: number;
  coordinate: number;
}

interface DecorativeTextileSample extends TextileSurfaceSample {
  metallic: number;
}

interface DecorativePalette {
  base: [number, number, number];
  secondary: [number, number, number];
  accent: [number, number, number];
}

function mixScalar(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp(amount, 0, 1);
}

function mixColor(
  from: [number, number, number],
  to: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = clamp(amount, 0, 1);
  return [
    mixScalar(from[0], to[0], t),
    mixScalar(from[1], to[1], t),
    mixScalar(from[2], to[2], t),
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shared tile-safe yarn primitive used by woven, knitted, lace, mesh and rope recipes. */
export function sampleYarnLayer(u: number, v: number, params: YarnLayerParams): YarnLayerSample {
  const count = Math.max(1, Math.round(params.count));
  const directionU = Math.round(params.direction[0]);
  const directionV = Math.round(params.direction[1]);
  const seed = params.seed ?? 0;
  const distortion = clamp(params.distortion ?? 0, 0, 0.45);
  const coordinate =
    (u * directionU + v * directionV) * count +
    (params.phase ?? 0) +
    periodicWarp(u, v, seed) * distortion;
  const profile = yarnProfile(coordinate, clamp(params.width, 0.05, 0.99));
  const along = (u * -directionV + v * directionU) * count;
  const twist = Math.max(1, Math.round(params.twist ?? 3));
  const fiber = Math.sin(TAU * along * twist + hash01(seed + 71) * TAU);
  return { profile, fiber, coordinate };
}

function decorativePalette(style: DecorativeTextileStyle): DecorativePalette {
  if (style === "jacquard") return { base: [0.14, 0.025, 0.045], secondary: [0.42, 0.055, 0.09], accent: [0.72, 0.42, 0.12] };
  if (style === "brocade") return { base: [0.12, 0.035, 0.16], secondary: [0.31, 0.09, 0.37], accent: [0.78, 0.52, 0.16] };
  if (style === "lace") return { base: [0.68, 0.62, 0.52], secondary: [0.9, 0.86, 0.76], accent: [0.98, 0.96, 0.9] };
  if (style === "ribKnit") return { base: [0.16, 0.22, 0.18], secondary: [0.28, 0.38, 0.31], accent: [0.46, 0.54, 0.47] };
  if (style === "corduroy") return { base: [0.28, 0.12, 0.055], secondary: [0.46, 0.24, 0.1], accent: [0.62, 0.38, 0.17] };
  if (style === "mesh") return { base: [0.025, 0.03, 0.035], secondary: [0.12, 0.14, 0.15], accent: [0.35, 0.38, 0.4] };
  if (style === "twistedRope") return { base: [0.28, 0.2, 0.11], secondary: [0.55, 0.42, 0.24], accent: [0.73, 0.61, 0.39] };
  return { base: [0.08, 0.16, 0.25], secondary: [0.15, 0.36, 0.55], accent: [0.45, 0.68, 0.82] };
}

function resolvePalette(style: DecorativeTextileStyle, params: DecorativeTextileParams): DecorativePalette {
  const defaults = decorativePalette(style);
  return {
    base: params.color ?? defaults.base,
    secondary: params.secondaryColor ?? defaults.secondary,
    accent: params.accentColor ?? defaults.accent,
  };
}

function flowerMask(u: number, v: number, repeat: number): number {
  const x = fract(u * repeat) - 0.5;
  const y = fract(v * repeat) - 0.5;
  const radius = Math.hypot(x, y);
  const angle = Math.atan2(y, x);
  const petalRadius = 0.23 + Math.cos(angle * 6) * 0.09;
  const petals = 1 - smoothstep(petalRadius - 0.045, petalRadius + 0.035, radius);
  const center = 1 - smoothstep(0.075, 0.14, radius);
  return clamp(Math.max(petals, center), 0, 1);
}

function diamondMask(u: number, v: number, repeat: number): number {
  const x = Math.abs(fract(u * repeat) - 0.5);
  const y = Math.abs(fract(v * repeat) - 0.5);
  return 1 - smoothstep(0.2, 0.31, x + y);
}

function finalWear(
  sample: DecorativeTextileSample,
  u: number,
  v: number,
  params: DecorativeTextileParams,
): DecorativeTextileSample {
  const seed = params.seed ?? 307;
  const wear = clamp(params.wear ?? 0.12, 0, 1);
  const fiberStrength = clamp(params.fiberStrength ?? 0.5, 0, 1);
  const noise = periodicWarp(u, v, seed + 503) * 0.5 + 0.5;
  const shade = 1 + (noise - 0.5) * wear * 0.24;
  return {
    ...sample,
    color: scaleColor(sample.color, shade),
    height: clamp(sample.height + (noise - 0.5) * fiberStrength * 0.018, 0, 1),
    roughness: clamp(sample.roughness + noise * wear * 0.07, 0.04, 1),
  };
}

function sampleJacquard(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 307;
  const repeat = Math.max(1, Math.round(params.repeat ?? 3));
  const scale = Math.max(8, Math.round(params.scale ?? 64));
  const palette = resolvePalette("jacquard", params);
  const weave = sampleWovenTextile(u, v, {
    pattern: "satin", seed, scale, color: palette.base, secondaryColor: palette.secondary,
    distortion: params.distortion ?? 0.12, fiberStrength: params.fiberStrength ?? 0.5, wear: 0,
  });
  const motif = flowerMask(u, v, repeat);
  const damask = 0.5 + 0.5 * Math.sin(TAU * (u + v) * scale);
  return finalWear({
    color: mixColor(weave.color, palette.accent, motif * (0.42 + damask * 0.2)),
    height: clamp(weave.height * 0.72 + motif * 0.24, 0, 1),
    roughness: mixScalar(0.68, 0.42, motif),
    ao: clamp(weave.ao - motif * 0.05, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleBrocade(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 331;
  const repeat = Math.max(1, Math.round(params.repeat ?? 4));
  const scale = Math.max(8, Math.round(params.scale ?? 56));
  const palette = resolvePalette("brocade", params);
  const weave = sampleWovenTextile(u, v, {
    pattern: "twill", seed, scale, color: palette.base, secondaryColor: palette.secondary,
    distortion: params.distortion ?? 0.1, fiberStrength: params.fiberStrength ?? 0.5, wear: 0,
  });
  const flower = flowerMask(u + 0.5 / repeat, v, repeat);
  const diamond = diamondMask(u, v, repeat);
  const ornament = clamp(Math.max(flower, diamond * 0.72), 0, 1);
  const goldFiber = 0.84 + Math.sin(TAU * (u - v) * scale * 2) * 0.12;
  return finalWear({
    color: mixColor(weave.color, scaleColor(palette.accent, goldFiber), ornament),
    height: clamp(weave.height * 0.66 + ornament * 0.31, 0, 1),
    roughness: mixScalar(0.72, 0.24, ornament),
    ao: clamp(weave.ao - ornament * 0.08, 0, 1),
    metallic: ornament * 0.72,
  }, u, v, params);
}

function sampleLace(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 353;
  const scale = Math.max(4, Math.round((params.scale ?? 20) / 2) * 2);
  const repeat = Math.max(1, Math.round(params.repeat ?? 4));
  const openness = clamp(params.openness ?? 0.62, 0.2, 0.9);
  const palette = resolvePalette("lace", params);
  const width = mixScalar(0.5, 0.18, openness);
  const diagonalA = sampleYarnLayer(u, v, { direction: [1, 1], count: scale / 2, width, seed, distortion: params.distortion ?? 0.04 });
  const diagonalB = sampleYarnLayer(u, v, { direction: [1, -1], count: scale / 2, width, seed: seed + 11, distortion: params.distortion ?? 0.04 });
  const flower = flowerMask(u, v, repeat);
  const edge = smoothstep(0.28, 0.58, flower) * (1 - smoothstep(0.74, 0.98, flower));
  const thread = clamp(Math.max(diagonalA.profile, diagonalB.profile, edge), 0, 1);
  const crossing = Math.min(diagonalA.profile, diagonalB.profile);
  const fiber = diagonalA.profile > diagonalB.profile ? diagonalA.fiber : diagonalB.fiber;
  const fiberStrength = params.fiberStrength ?? 0.55;
  return finalWear({
    color: scaleColor(mixColor(palette.base, palette.accent, edge), 0.28 + thread * 0.72 + fiber * fiberStrength * 0.025),
    height: clamp(0.03 + thread * 0.82 + crossing * 0.1, 0, 1),
    roughness: clamp(0.86 + fiber * 0.035, 0.04, 1),
    ao: clamp(0.24 + thread * 0.74 - crossing * 0.06, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleRibKnit(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 379;
  const scale = Math.max(6, Math.round(params.scale ?? 28));
  const palette = resolvePalette("ribKnit", params);
  const warp = periodicWarp(u, v, seed) * (params.distortion ?? 0.12);
  const localU = fract(u * scale + warp) - 0.5;
  const stitchY = fract(v * scale * 0.5) - 0.5;
  const loopCenter = 0.19 * Math.cos(stitchY * Math.PI);
  const left = Math.exp(-Math.pow((localU + loopCenter) / 0.12, 2));
  const right = Math.exp(-Math.pow((localU - loopCenter) / 0.12, 2));
  const bridge = Math.exp(-Math.pow(localU / 0.2, 2)) * smoothstep(0.05, 0.45, Math.abs(stitchY));
  const stitch = clamp(Math.max(left, right, bridge * 0.78), 0, 1);
  const rib = yarnProfile(u * scale, 0.88);
  const fiber = Math.sin(TAU * v * scale * 3 + hash01(seed) * TAU);
  return finalWear({
    color: scaleColor(mixColor(palette.base, palette.secondary, rib * 0.72), 0.62 + stitch * 0.32 + fiber * 0.025),
    height: clamp(0.08 + rib * 0.34 + stitch * 0.5, 0, 1),
    roughness: clamp(0.88 + fiber * 0.025, 0.04, 1),
    ao: clamp(0.5 + stitch * 0.46 - (1 - rib) * 0.12, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleCorduroy(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 401;
  const scale = Math.max(5, Math.round(params.scale ?? 18));
  const palette = resolvePalette("corduroy", params);
  const wale = sampleYarnLayer(u, v, {
    direction: [1, 0], count: scale, width: 0.82, seed,
    distortion: params.distortion ?? 0.09, twist: 7,
  });
  const micro = 0.5 + 0.5 * Math.sin(TAU * v * scale * 9 + periodicWarp(u, v, seed + 13) * 0.8);
  const groove = Math.pow(wale.profile, 1.45);
  return finalWear({
    color: scaleColor(mixColor(palette.base, palette.secondary, groove), 0.55 + groove * 0.38 + micro * 0.04),
    height: clamp(0.08 + groove * 0.84 + micro * 0.025, 0, 1),
    roughness: clamp(0.82 + wale.fiber * 0.035, 0.04, 1),
    ao: clamp(0.42 + groove * 0.56, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleMesh(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 431;
  const scale = Math.max(4, Math.round((params.scale ?? 18) / 2) * 2);
  const openness = clamp(params.openness ?? 0.68, 0.2, 0.9);
  const palette = resolvePalette("mesh", params);
  const width = mixScalar(0.62, 0.12, openness);
  const strandA = sampleYarnLayer(u, v, { direction: [1, 1], count: scale / 2, width, seed, distortion: params.distortion ?? 0.03 });
  const strandB = sampleYarnLayer(u, v, { direction: [1, -1], count: scale / 2, width, seed: seed + 19, distortion: params.distortion ?? 0.03 });
  const thread = Math.max(strandA.profile, strandB.profile);
  const crossing = Math.min(strandA.profile, strandB.profile);
  const fiber = strandA.profile > strandB.profile ? strandA.fiber : strandB.fiber;
  return finalWear({
    color: scaleColor(mixColor(palette.base, palette.accent, thread), 0.24 + thread * 0.7 + fiber * 0.025),
    height: clamp(0.025 + thread * 0.78 + crossing * 0.15, 0, 1),
    roughness: clamp(0.76 + fiber * 0.04, 0.04, 1),
    ao: clamp(0.2 + thread * 0.76 - crossing * 0.08, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleTwistedRope(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 457;
  const scale = Math.max(3, Math.round(params.scale ?? 8));
  const palette = resolvePalette("twistedRope", params);
  const local = fract(u * scale) - 0.5;
  let profile = 0;
  let strandShade = 0;
  for (let strand = 0; strand < 3; strand++) {
    const phase = strand / 3;
    const center = Math.sin(TAU * (v * scale + phase)) * 0.19;
    const strandProfile = Math.exp(-Math.pow((local - center) / 0.17, 2));
    if (strandProfile > profile) {
      profile = strandProfile;
      strandShade = phase;
    }
  }
  const twist = 0.5 + 0.5 * Math.sin(TAU * (v * scale * 9 - u * scale * 2) + hash01(seed) * TAU);
  const color = mixColor(palette.base, palette.accent, clamp(profile * 0.72 + strandShade * 0.18, 0, 1));
  return finalWear({
    color: scaleColor(color, 0.45 + profile * 0.48 + twist * 0.05),
    height: clamp(0.04 + profile * 0.9 + twist * 0.025, 0, 1),
    roughness: clamp(0.84 + (twist - 0.5) * 0.06, 0.04, 1),
    ao: clamp(0.38 + profile * 0.6, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function samplePleatedSilk(u: number, v: number, params: DecorativeTextileParams): DecorativeTextileSample {
  const seed = params.seed ?? 487;
  const scale = Math.max(12, Math.round(params.scale ?? 48));
  const repeat = Math.max(2, Math.round(params.repeat ?? 6));
  const palette = resolvePalette("pleatedSilk", params);
  const weave = sampleWovenTextile(u, v, {
    pattern: "satin", seed, scale, color: palette.base, secondaryColor: palette.secondary,
    distortion: params.distortion ?? 0.06, fiberStrength: params.fiberStrength ?? 0.3, wear: 0,
  });
  const wave = 0.5 + 0.5 * Math.cos(TAU * u * repeat);
  const crease = Math.pow(1 - Math.abs(Math.sin(TAU * u * repeat)), 7);
  const relief = clamp(params.relief ?? 0.65, 0, 1);
  const highlight = Math.pow(wave, 1.7);
  return finalWear({
    color: scaleColor(mixColor(weave.color, palette.accent, highlight * 0.32), 0.62 + wave * 0.38),
    height: clamp(weave.height * 0.22 + wave * relief * 0.7 + crease * 0.08, 0, 1),
    roughness: clamp(0.24 + (1 - highlight) * 0.22, 0.04, 1),
    ao: clamp(0.48 + wave * 0.5 - crease * 0.12, 0, 1),
    metallic: 0,
  }, u, v, params);
}

function sampleDecorativeTextile(
  u: number,
  v: number,
  params: DecorativeTextileParams,
): DecorativeTextileSample {
  const style = params.style ?? "jacquard";
  if (style === "brocade") return sampleBrocade(u, v, params);
  if (style === "lace") return sampleLace(u, v, params);
  if (style === "ribKnit") return sampleRibKnit(u, v, params);
  if (style === "corduroy") return sampleCorduroy(u, v, params);
  if (style === "mesh") return sampleMesh(u, v, params);
  if (style === "twistedRope") return sampleTwistedRope(u, v, params);
  if (style === "pleatedSilk") return samplePleatedSilk(u, v, params);
  return sampleJacquard(u, v, params);
}

/** P22-P25 continuation study: pattern-driven yarn construction and layered cloth relief. */
export function decorativeTextileFields(params: DecorativeTextileParams = {}): MaterialFields {
  return {
    baseColor: (u, v) => sampleDecorativeTextile(u, v, params).color,
    metallic: (u, v) => sampleDecorativeTextile(u, v, params).metallic,
    roughness: (u, v) => sampleDecorativeTextile(u, v, params).roughness,
    ao: (u, v) => sampleDecorativeTextile(u, v, params).ao,
    height: (u, v) => sampleDecorativeTextile(u, v, params).height,
    normalStrength: (params.style ?? "jacquard") === "pleatedSilk" ? 2.2 : 3.6,
  };
}

type DecorativeStyleParams = Omit<DecorativeTextileParams, "style">;

export const jacquardTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "jacquard" });
export const brocadeTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "brocade" });
export const laceTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "lace" });
export const ribKnitTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "ribKnit" });
export const corduroyTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "corduroy" });
export const meshTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "mesh" });
export const twistedRopeTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "twistedRope" });
export const pleatedSilkTextile = (params: DecorativeStyleParams = {}): MaterialFields =>
  decorativeTextileFields({ ...params, style: "pleatedSilk" });

export const DECORATIVE_TEXTILE_LIBRARY = {
  jacquardTextile,
  brocadeTextile,
  laceTextile,
  ribKnitTextile,
  corduroyTextile,
  meshTextile,
  twistedRopeTextile,
  pleatedSilkTextile,
} as const;
