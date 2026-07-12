/** Procedural PBR recipes for traditional Roman streets and buildings. */
import { clamp } from "../math/scalar.js";
import { makeNoise, fbm2 } from "../random/noise.js";
import type { MaterialFields } from "./pbr.js";

type RGB = [number, number, number];

export interface WeatheredPlasterParams {
  seed?: number;
  color?: RGB;
  wear?: number;
  scale?: number;
}

export interface TerracottaRoofParams {
  seed?: number;
  color?: RGB;
  columns?: number;
  rows?: number;
  weathering?: number;
}

export interface RomanCobblestoneParams {
  seed?: number;
  color?: RGB;
  columns?: number;
  rows?: number;
  wetness?: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function cellRandom(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);
}

function shade(color: RGB, amount: number): RGB {
  return [
    clamp(color[0] * amount, 0, 1),
    clamp(color[1] * amount, 0, 1),
    clamp(color[2] * amount, 0, 1),
  ];
}

/** Warm lime render with broad damp stains, fine grit and recessed hairline cracks. */
export function weatheredPlaster(params: WeatheredPlasterParams = {}): MaterialFields {
  const seed = params.seed ?? 71;
  const color = params.color ?? [0.72, 0.52, 0.34];
  const wear = clamp(params.wear ?? 0.52, 0, 1);
  const scale = Math.max(0.5, params.scale ?? 4.2);
  const broadNoise = makeNoise(seed);
  const fineNoise = makeNoise(seed + 17);
  const crackNoise = makeNoise(seed + 41);

  const broad = (u: number, v: number) =>
    fbm2(broadNoise, u * scale, v * scale * 0.78, { octaves: 5 }) * 0.5 + 0.5;
  const fine = (u: number, v: number) =>
    fbm2(fineNoise, u * 34, v * 34, { octaves: 3 }) * 0.5 + 0.5;
  const crack = (u: number, v: number) => {
    const a = Math.abs(fbm2(crackNoise, u * 13, v * 13, { octaves: 2 }));
    return (1 - smoothstep(0, 0.028, a)) * wear * 0.65;
  };

  return {
    baseColor: (u, v) => {
      const b = broad(u, v);
      const grit = fine(u, v);
      const damp = smoothstep(0.57, 0.9, 1 - b) * wear;
      const cracks = crack(u, v);
      return shade(color, 0.82 + b * 0.25 + (grit - 0.5) * 0.08 - damp * 0.25 - cracks * 0.32);
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.72 + fine(u, v) * 0.2 + wear * 0.06, 0.04, 1),
    ao: (u, v) => clamp(1 - crack(u, v) * 0.58, 0, 1),
    height: (u, v) => clamp(0.48 + (fine(u, v) - 0.5) * 0.12 - crack(u, v) * 0.3, 0, 1),
    normalStrength: 2.1,
  };
}

/** Curved terracotta tile courses with stagger, mortar seams and fired-clay variation. */
export function terracottaRoof(params: TerracottaRoofParams = {}): MaterialFields {
  const seed = params.seed ?? 83;
  const color = params.color ?? [0.48, 0.18, 0.09];
  const columns = Math.max(2, Math.round(params.columns ?? 12));
  const rows = Math.max(2, Math.round(params.rows ?? 22));
  const weathering = clamp(params.weathering ?? 0.38, 0, 1);
  const noise = makeNoise(seed + 9);

  const tile = (u: number, v: number) => {
    const row = Math.floor(v * rows);
    const xScaled = u * columns + (row & 1) * 0.5;
    const col = Math.floor(xScaled);
    const x = fract(xScaled);
    const y = fract(v * rows);
    const edge = Math.min(x, 1 - x, y, 1 - y);
    const seam = 1 - smoothstep(0.025, 0.09, edge);
    const curve = Math.sin(Math.PI * x);
    const random = cellRandom(col, row, seed);
    return { seam, curve, random };
  };

  return {
    baseColor: (u, v) => {
      const t = tile(u, v);
      const soot = fbm2(noise, u * 7, v * 9, { octaves: 4 }) * 0.5 + 0.5;
      const variation = 0.78 + t.random * 0.34 - soot * weathering * 0.16;
      return t.seam > 0.65 ? shade(color, 0.38) : shade(color, variation);
    },
    metallic: () => 0,
    roughness: (u, v) => {
      const t = tile(u, v);
      return clamp(0.62 + t.random * 0.2 + t.seam * 0.16 + weathering * 0.08, 0.04, 1);
    },
    ao: (u, v) => clamp(1 - tile(u, v).seam * 0.55, 0, 1),
    height: (u, v) => {
      const t = tile(u, v);
      return clamp(0.28 + t.curve * 0.56 - t.seam * 0.22, 0, 1);
    },
    normalStrength: 4.2,
  };
}

/** Dark basalt sampietrini: staggered rectangular setts, worn crowns and deep joints. */
export function romanCobblestone(params: RomanCobblestoneParams = {}): MaterialFields {
  const seed = params.seed ?? 97;
  const color = params.color ?? [0.20, 0.19, 0.17];
  const columns = Math.max(2, Math.round(params.columns ?? 13));
  const rows = Math.max(2, Math.round(params.rows ?? 24));
  const wetness = clamp(params.wetness ?? 0.08, 0, 1);
  const grainNoise = makeNoise(seed + 13);

  const stone = (u: number, v: number) => {
    const row = Math.floor(v * rows);
    const xScaled = u * columns + (row & 1) * 0.5;
    const col = Math.floor(xScaled);
    const x = fract(xScaled);
    const y = fract(v * rows);
    const edge = Math.min(x, 1 - x, y, 1 - y);
    const bevel = smoothstep(0.035, 0.16, edge);
    const random = cellRandom(col, row, seed);
    return { bevel, random };
  };

  return {
    baseColor: (u, v) => {
      const s = stone(u, v);
      const grain = fbm2(grainNoise, u * 55, v * 55, { octaves: 3 }) * 0.5 + 0.5;
      if (s.bevel < 0.12) return [0.055, 0.05, 0.045];
      return shade(color, 0.72 + s.random * 0.34 + (grain - 0.5) * 0.12 - wetness * 0.2);
    },
    metallic: () => 0,
    roughness: (u, v) => {
      const s = stone(u, v);
      return clamp(0.9 - wetness * 0.56 + (1 - s.bevel) * 0.08, 0.04, 1);
    },
    ao: (u, v) => clamp(0.42 + stone(u, v).bevel * 0.58, 0, 1),
    height: (u, v) => {
      const s = stone(u, v);
      return clamp(0.18 + s.bevel * (0.48 + s.random * 0.14), 0, 1);
    },
    normalStrength: 4.8,
  };
}
