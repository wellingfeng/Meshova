import { clamp } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { blendColor, voronoi } from "./patterns.js";
import type { MaterialFields } from "./pbr.js";

type RGB = [number, number, number];

type PatternKind =
  | "flutedColumn"
  | "pebbledGround"
  | "woodPlanks"
  | "glassBlocks"
  | "rock"
  | "concrete"
  | "bambooBlind"
  | "floorTiles"
  | "lanternPaper"
  | "bambooRaft"
  | "volcanicRock"
  | "stoneColumn"
  | "bamboo"
  | "window"
  | "plasterWall"
  | "meteor"
  | "grass"
  | "road"
  | "roofTiles"
  | "coins"
  | "basketWeave"
  | "bark"
  | "steps"
  | "stoneWall"
  | "burlap"
  | "marble"
  | "redWall"
  | "brickWall"
  | "carpet"
  | "desert"
  | "snow";

export interface BilibiliMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  wear?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface BilibiliMaterialParamSpec {
  key: keyof BilibiliMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface BilibiliMaterialDefinition {
  episode: number;
  bvid: string;
  label: string;
  kind: PatternKind;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  metallic: number;
  normalStrength: number;
  variant?: number;
}

interface PatternContext {
  definition: BilibiliMaterialDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: (u: number, v: number) => number;
  cracks: (u: number, v: number) => number;
  scale: number;
  detail: number;
  wear: number;
}

interface PatternSample {
  height: number;
  mask: number;
  variation: number;
  wearMask: number;
  roughness?: number;
  metallic?: number;
  ao?: number;
  emission?: RGB;
}

const TAU = Math.PI * 2;
const clamp01 = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);
const smoothstep = (low: number, high: number, value: number) => {
  const t = clamp01((value - low) / Math.max(1e-6, high - low));
  return t * t * (3 - 2 * t);
};

function hash2(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);
}

function shade(color: RGB, amount: number): RGB {
  return [
    clamp01(color[0] * amount),
    clamp01(color[1] * amount),
    clamp01(color[2] * amount),
  ];
}

function gridSample(u: number, v: number, columns: number, rows: number, gap: number, offset = 0) {
  const row = Math.floor(v * rows);
  const x = u * columns + (row % 2) * offset;
  const localX = fract(x);
  const localY = fract(v * rows);
  const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
  const inside = smoothstep(gap, gap * 1.8, edge);
  return { localX, localY, edge, inside, column: Math.floor(x), row };
}

function samplePattern(context: PatternContext, u: number, v: number): PatternSample {
  const { definition, noise, detailNoise, cells, cracks, scale, detail } = context;
  const x = u * scale;
  const y = v * scale;
  const low = fbm2(noise, x, y, { octaves: 4 }) * 0.5 + 0.5;
  const fine = fbm2(detailNoise, x * detail * 5, y * detail * 5, { octaves: 3 }) * 0.5 + 0.5;
  const cell = cells(u, v);
  const crack = 1 - smoothstep(0.015, 0.16, cracks(u, v));
  const variant = definition.variant ?? 0;

  switch (definition.kind) {
    case "flutedColumn": {
      const flutes = Math.pow(0.5 + Math.cos((u * (18 + variant * 2)) * TAU) * 0.5, 0.7);
      const trim = smoothstep(0.065, 0.035, Math.min(v, 1 - v));
      const rope = 0.5 + Math.sin((u * 34 + v * 8) * TAU) * 0.5;
      return { height: clamp01(flutes * 0.64 + trim * (0.2 + rope * 0.18)), mask: trim, variation: low * 0.55 + fine * 0.45, wearMask: 1 - flutes, metallic: trim * 0.9, roughness: 0.62 - trim * 0.38, ao: 0.65 + flutes * 0.35 };
    }
    case "pebbledGround": {
      const pebble = smoothstep(0.46, 0.1, cell) * smoothstep(0.35, 0.75, hash2(Math.floor(x * 8), Math.floor(y * 8), definition.seed));
      return { height: clamp01(low * 0.42 + fine * 0.12 + pebble * 0.55 - crack * 0.22), mask: pebble * 0.8 + crack * 0.35, variation: low * 0.7 + fine * 0.3, wearMask: crack, roughness: 0.82 + fine * 0.12, ao: 1 - crack * 0.45 };
    }
    case "woodPlanks": {
      const count = Math.max(3, Math.round(scale));
      const local = fract(u * count);
      const seam = 1 - smoothstep(0.025, 0.065, Math.min(local, 1 - local));
      const warp = fbm2(noise, u * 3, v * 3, { octaves: 3 }) * 0.08;
      const grain = Math.pow(0.5 + Math.sin((v * (24 + detail * 8) + warp) * TAU) * 0.5, 1.8);
      const plank = hash2(Math.floor(u * count), 0, definition.seed);
      return { height: clamp01(0.42 + grain * 0.3 - seam * 0.48 + fine * 0.08), mask: seam, variation: clamp01(grain * 0.55 + plank * 0.45), wearMask: seam + (1 - grain) * 0.25, roughness: definition.roughness + grain * 0.12, ao: 1 - seam * 0.55 };
    }
    case "glassBlocks": {
      const tile = gridSample(u, v, Math.max(3, Math.round(scale)), Math.max(4, Math.round(scale * 1.25)), 0.055);
      const dx = Math.abs(tile.localX - 0.5) * 2;
      const dy = Math.abs(tile.localY - 0.5) * 2;
      const pane = tile.inside * clamp01(1 - Math.max(dx, dy));
      const frame = 1 - tile.inside;
      return { height: clamp01(frame * 0.72 + pane * 0.38 + fine * 0.06), mask: frame, variation: low * 0.35 + pane * 0.65, wearMask: frame * fine, metallic: frame * 0.72, roughness: 0.16 + frame * 0.28, ao: 1 - frame * 0.42 };
    }
    case "rock": {
      const ridge = 1 - Math.abs(low * 2 - 1);
      return { height: clamp01(ridge * 0.65 + fine * 0.18 - crack * 0.18), mask: crack * 0.6 + (1 - ridge) * 0.2, variation: ridge * 0.7 + fine * 0.3, wearMask: crack, roughness: 0.82 + fine * 0.13, ao: 0.7 + ridge * 0.3 };
    }
    case "concrete": {
      const pits = smoothstep(0.22, 0.03, cell) * smoothstep(0.58, 0.88, fine);
      return { height: clamp01(0.48 + (low - 0.5) * 0.35 + (fine - 0.5) * 0.12 - pits * 0.32 - crack * variant * 0.12), mask: pits + crack * variant * 0.5, variation: low * 0.72 + fine * 0.28, wearMask: pits + crack, roughness: 0.78 + fine * 0.14, ao: 1 - pits * 0.5 - crack * 0.2 };
    }
    case "bambooBlind": {
      const count = Math.max(12, Math.round(scale * 3));
      const slat = 0.5 + Math.cos(fract(u * count) * TAU) * 0.5;
      const cord = smoothstep(0.075, 0.025, Math.abs(fract(v * 7) - 0.5));
      return { height: clamp01(slat * 0.62 + cord * 0.36 + fine * 0.06), mask: cord, variation: slat * 0.45 + low * 0.55, wearMask: (1 - slat) * 0.35, roughness: 0.7 + fine * 0.12, ao: 0.66 + slat * 0.34 };
    }
    case "floorTiles": {
      const tile = gridSample(u, v, Math.max(3, Math.round(scale)), Math.max(3, Math.round(scale)), 0.045, variant > 0 ? 0.5 : 0);
      const chip = crack * smoothstep(0.66, 0.9, fine);
      const cellValue = hash2(tile.column, tile.row, definition.seed);
      return { height: clamp01(0.18 + tile.inside * (0.56 + smoothstep(0.04, 0.15, tile.edge) * 0.2) - chip * 0.18 + (fine - 0.5) * 0.08), mask: 1 - tile.inside, variation: cellValue * 0.65 + fine * 0.35, wearMask: chip + (1 - tile.inside), roughness: definition.roughness + (1 - tile.inside) * 0.22 + fine * 0.06, ao: 1 - (1 - tile.inside) * 0.48 };
    }
    case "lanternPaper": {
      const vertical = 1 - smoothstep(0.025, 0.055, Math.min(fract(u * 8), 1 - fract(u * 8)));
      const horizontal = 1 - smoothstep(0.02, 0.05, Math.min(fract(v * 5), 1 - fract(v * 5)));
      const frame = Math.max(vertical, horizontal);
      const paper = 0.72 + fine * 0.28;
      return { height: clamp01(paper * 0.38 + frame * 0.5), mask: frame, variation: paper, wearMask: crack * 0.25, metallic: frame * 0.5, roughness: 0.68 - frame * 0.28, ao: 1 - frame * 0.24, emission: [paper * 0.32, paper * 0.12, paper * 0.035] };
    }
    case "bambooRaft":
    case "bamboo": {
      const count = Math.max(4, Math.round(scale));
      const localX = fract(u * count);
      const stalk = Math.pow(Math.sin(localX * Math.PI), 0.65);
      const nodeCount = definition.kind === "bamboo" ? 6 : 3;
      const node = 1 - smoothstep(0.025, 0.07, Math.abs(fract(v * nodeCount) - 0.5));
      return { height: clamp01(stalk * 0.68 + node * 0.28 + fine * 0.05), mask: node, variation: stalk * 0.42 + low * 0.58, wearMask: (1 - stalk) * 0.4, roughness: 0.64 + fine * 0.12, ao: 0.66 + stalk * 0.34 };
    }
    case "volcanicRock": {
      const pore = smoothstep(0.34, 0.06, cell) * smoothstep(0.34, 0.68, fine);
      const ridge = 1 - Math.abs(low * 2 - 1);
      return { height: clamp01(0.34 + ridge * 0.48 - pore * 0.65), mask: pore, variation: ridge * 0.5 + fine * 0.5, wearMask: pore, roughness: 0.9 + fine * 0.08, ao: 1 - pore * 0.7 };
    }
    case "stoneColumn": {
      const band = 1 - smoothstep(0.035, 0.085, Math.min(fract(v * 5), 1 - fract(v * 5)));
      const flute = 0.5 + Math.cos(u * 14 * TAU) * 0.5;
      return { height: clamp01(0.32 + flute * 0.38 + band * 0.23 + (low - 0.5) * 0.18), mask: band, variation: low * 0.7 + fine * 0.3, wearMask: crack + (1 - flute) * 0.2, roughness: 0.76 + fine * 0.12, ao: 0.68 + flute * 0.32 };
    }
    case "window": {
      const tile = gridSample(u, v, Math.max(2, Math.round(scale * 0.55)), Math.max(3, Math.round(scale * 0.8)), 0.09);
      const frame = 1 - tile.inside;
      const reflection = 0.5 + Math.sin((u + v * 0.35 + low * 0.08) * TAU * 3) * 0.5;
      return { height: clamp01(0.3 + frame * 0.5 + reflection * 0.05), mask: frame, variation: reflection, wearMask: frame * crack, metallic: frame * 0.76, roughness: 0.1 + frame * 0.32, ao: 1 - frame * 0.4 };
    }
    case "plasterWall":
    case "redWall": {
      const block = gridSample(u, v, Math.max(3, Math.round(scale * 0.7)), Math.max(4, Math.round(scale)), 0.025, 0.5);
      const grime = smoothstep(0.45, 0.8, low) * fine;
      const exposed = crack * smoothstep(0.52, 0.82, fine);
      return { height: clamp01(0.48 + (low - 0.5) * 0.25 - exposed * 0.28 - (1 - block.inside) * 0.08), mask: exposed + grime * 0.35, variation: low * 0.76 + fine * 0.24, wearMask: exposed + grime, roughness: 0.78 + fine * 0.13, ao: 1 - exposed * 0.5 };
    }
    case "meteor": {
      const crater = smoothstep(0.52, 0.08, cell);
      const rim = smoothstep(0.58, 0.38, cell) - smoothstep(0.35, 0.12, cell);
      return { height: clamp01(0.42 + low * 0.3 + rim * 0.38 - crater * 0.52 + fine * 0.08), mask: crater, variation: low * 0.55 + cell * 0.45, wearMask: crater, roughness: 0.84 + fine * 0.12, ao: 1 - crater * 0.65 };
    }
    case "grass": {
      const columns = Math.max(18, Math.round(scale * detail * 2));
      const cellX = Math.floor(u * columns);
      const cellY = Math.floor(v * columns);
      const localX = fract(u * columns) - 0.5;
      const localY = fract(v * columns);
      const lean = (hash2(cellX, cellY, definition.seed) - 0.5) * 0.45;
      const blade = smoothstep(0.2, 0.02, Math.abs(localX - lean * localY)) * smoothstep(1, 0.05, localY);
      return { height: clamp01(0.2 + blade * 0.75 + low * 0.16), mask: blade, variation: low * 0.48 + blade * 0.52, wearMask: 1 - blade, roughness: 0.82 + fine * 0.12, ao: 0.72 + blade * 0.28 };
    }
    case "road": {
      const aggregate = smoothstep(0.4, 0.08, cell) * smoothstep(0.55, 0.86, fine);
      return { height: clamp01(0.45 + fine * 0.15 + aggregate * 0.3 - crack * 0.28), mask: crack + aggregate * 0.45, variation: low * 0.45 + fine * 0.55, wearMask: crack, roughness: 0.86 + fine * 0.1, ao: 1 - crack * 0.5 };
    }
    case "roofTiles": {
      const rows = Math.max(5, Math.round(scale));
      const row = Math.floor(v * rows);
      const localX = fract(u * rows * 0.65 + (row % 2) * 0.5);
      const localY = fract(v * rows);
      const arch = Math.sin(localX * Math.PI) * smoothstep(0, 0.2, localY) * (1 - smoothstep(0.78, 1, localY));
      const seam = 1 - smoothstep(0.025, 0.075, Math.min(localX, 1 - localX, localY));
      return { height: clamp01(0.18 + arch * 0.72 - seam * 0.15 + fine * 0.05), mask: seam, variation: arch * 0.52 + low * 0.48, wearMask: seam + crack * 0.2, roughness: 0.72 + fine * 0.14, ao: 0.58 + arch * 0.42 };
    }
    case "coins": {
      const columns = Math.max(4, Math.round(scale));
      const localX = fract(u * columns) - 0.5;
      const localY = fract(v * columns) - 0.5;
      const distance = Math.hypot(localX, localY);
      const disc = 1 - smoothstep(0.35, 0.46, distance);
      const rim = smoothstep(0.29, 0.34, distance) * disc;
      const emblem = disc * (0.5 + Math.cos(Math.atan2(localY, localX) * 6) * 0.5) * smoothstep(0.26, 0.08, distance);
      return { height: clamp01(disc * 0.55 + rim * 0.3 + emblem * 0.15 + fine * 0.06), mask: disc, variation: disc * (0.72 + fine * 0.28), wearMask: rim * fine, metallic: disc, roughness: 0.3 + (1 - disc) * 0.45 + fine * 0.08, ao: 1 - (1 - disc) * 0.35 };
    }
    case "basketWeave":
    case "burlap":
    case "carpet": {
      const frequency = Math.max(8, Math.round(scale * (definition.kind === "basketWeave" ? 2 : 5)));
      const warp = Math.pow(0.5 + Math.cos(u * frequency * TAU) * 0.5, definition.kind === "carpet" ? 3 : 1.2);
      const weft = Math.pow(0.5 + Math.cos(v * frequency * TAU) * 0.5, definition.kind === "carpet" ? 3 : 1.2);
      const over = (Math.floor(u * frequency) + Math.floor(v * frequency)) % 2 === 0;
      const weave = over ? warp * 0.72 + weft * 0.28 : warp * 0.28 + weft * 0.72;
      return { height: clamp01(0.18 + weave * 0.7 + fine * 0.08), mask: over ? warp : weft, variation: weave * 0.64 + low * 0.36, wearMask: (1 - weave) * 0.45, roughness: definition.kind === "carpet" ? 0.94 : 0.82 + fine * 0.1, ao: 0.66 + weave * 0.34 };
    }
    case "bark": {
      const warp = fbm2(noise, u * 2.2, v * 4.2, { octaves: 4 }) * 0.22;
      const groove = Math.pow(0.5 + Math.sin((u * scale * 1.6 + warp) * TAU) * 0.5, 1.7);
      const split = crack * smoothstep(0.58, 0.82, fine);
      return { height: clamp01(0.18 + groove * 0.66 + low * 0.12 - split * 0.2), mask: split, variation: groove * 0.62 + low * 0.38, wearMask: split + (1 - groove) * 0.22, roughness: 0.88 + fine * 0.1, ao: 0.58 + groove * 0.42 };
    }
    case "steps": {
      const bands = Math.max(4, Math.round(scale));
      const localY = fract(v * bands);
      const tread = smoothstep(0.08, 0.2, localY);
      const edge = 1 - smoothstep(0.025, 0.08, Math.min(localY, 1 - localY));
      const chips = crack * smoothstep(0.6, 0.86, fine);
      return { height: clamp01(0.2 + tread * 0.54 + edge * 0.18 - chips * 0.22), mask: edge + chips, variation: low * 0.68 + fine * 0.32, wearMask: edge * fine + chips, roughness: 0.8 + fine * 0.14, ao: 1 - edge * 0.38 };
    }
    case "stoneWall":
    case "brickWall": {
      const tile = gridSample(u, v, Math.max(4, Math.round(scale)), Math.max(7, Math.round(scale * 1.7)), definition.kind === "brickWall" ? 0.045 : 0.065, 0.5);
      const stone = hash2(tile.column, tile.row, definition.seed);
      const chip = crack * smoothstep(0.62, 0.86, fine) * tile.inside;
      return { height: clamp01(0.15 + tile.inside * (0.55 + stone * 0.18) - chip * 0.24), mask: 1 - tile.inside, variation: stone * 0.55 + low * 0.45, wearMask: chip + (1 - tile.inside), roughness: 0.82 + fine * 0.13, ao: 1 - (1 - tile.inside) * 0.58 };
    }
    case "marble": {
      const turbulence = fbm2(noise, x * 0.7, y * 0.7, { octaves: 5 }) * 0.5;
      const veins = Math.pow(1 - Math.abs(Math.sin((u * scale + turbulence) * TAU)), 7);
      const hairline = Math.pow(1 - Math.abs(Math.sin((v * scale * 1.7 + turbulence * 1.3) * TAU)), 14);
      return { height: clamp01(0.48 + (low - 0.5) * 0.1 - veins * 0.08), mask: clamp01(veins + hairline * 0.35), variation: low * 0.4 + veins * 0.6, wearMask: hairline, roughness: 0.2 + fine * 0.06, ao: 0.95 - veins * 0.12 };
    }
    case "desert": {
      const warp = fbm2(noise, x * 0.35, y * 0.35, { octaves: 4 }) * 0.25;
      const dune = 0.5 + Math.sin((u * scale * 0.65 + v * scale * 0.18 + warp) * TAU) * 0.5;
      const ripple = 0.5 + Math.sin((u * scale * detail * 2.8 + warp) * TAU) * 0.5;
      return { height: clamp01(0.12 + dune * 0.65 + ripple * 0.14 + fine * 0.05), mask: 1 - dune, variation: dune * 0.65 + fine * 0.35, wearMask: 1 - ripple, roughness: 0.86 + fine * 0.1, ao: 0.72 + dune * 0.28 };
    }
    case "snow": {
      const drift = fbm2(noise, x * 0.45, y * 0.45, { octaves: 5 }) * 0.5 + 0.5;
      const sparkle = smoothstep(0.93, 0.995, fine);
      return { height: clamp01(0.2 + drift * 0.62 + fine * 0.08), mask: sparkle, variation: drift * 0.72 + fine * 0.28, wearMask: 1 - drift, roughness: 0.58 + fine * 0.18 - sparkle * 0.18, ao: 0.82 + drift * 0.18 };
    }
  }
}

export function buildBilibiliMaterial(
  definition: BilibiliMaterialDefinition,
  params: BilibiliMaterialParams = {},
): MaterialFields {
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const wear = params.wear ?? definition.wear;
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughness = params.roughness ?? definition.roughness;
  const context: PatternContext = {
    definition: { ...definition, seed, roughness },
    noise: makeNoise(seed),
    detailNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(3, scale * detail), seed: seed + 13, metric: "f1" }),
    cracks: voronoi({ scale: Math.max(2, scale * 0.85), seed: seed + 29, metric: "f2-f1" }),
    scale,
    detail,
    wear,
  };
  const sample = (u: number, v: number) => samplePattern(context, u, v);

  return {
    baseColor: (u, v) => {
      const result = sample(u, v);
      const mixed = blendColor(color, accentColor, clamp01(result.mask));
      const value = 0.76 + result.variation * 0.34 - clamp01(result.wearMask) * wear * 0.22;
      return shade(mixed, value);
    },
    metallic: (u, v) => clamp01(sample(u, v).metallic ?? definition.metallic),
    roughness: (u, v) => clamp(sample(u, v).roughness ?? roughness, 0.04, 1),
    ao: (u, v) => clamp01(sample(u, v).ao ?? 1),
    height: (u, v) => clamp01(sample(u, v).height),
    emission: (u, v) => sample(u, v).emission ?? [0, 0, 0],
    normalStrength: definition.normalStrength,
  };
}

export const BILIBILI_MATERIAL_DEFINITIONS = {
  stylizedColumn: { episode: 1, bvid: "BV1FXNGzPEYZ", label: "风格化柱子", kind: "flutedColumn", seed: 1, scale: 7, detail: 3, wear: 0.18, color: [0.76, 0.72, 0.64], accentColor: [0.48, 0.31, 0.08], roughness: 0.62, metallic: 0, normalStrength: 4 },
  earthyGround: { episode: 2, bvid: "BV1ck6JBoELP", label: "碎石地面", kind: "pebbledGround", seed: 2, scale: 7, detail: 4, wear: 0.35, color: [0.26, 0.23, 0.18], accentColor: [0.48, 0.45, 0.39], roughness: 0.9, metallic: 0, normalStrength: 4 },
  stylizedWoodPlanks: { episode: 3, bvid: "BV1QtnnzjELT", label: "风格化木板", kind: "woodPlanks", seed: 3, scale: 8, detail: 4, wear: 0.24, color: [0.34, 0.2, 0.1], accentColor: [0.66, 0.46, 0.27], roughness: 0.66, metallic: 0, normalStrength: 3 },
  glassBlocks: { episode: 4, bvid: "BV1EoYyzZE3j", label: "压花玻璃窗", kind: "glassBlocks", seed: 4, scale: 5, detail: 3, wear: 0.15, color: [0.13, 0.29, 0.3], accentColor: [0.16, 0.3, 0.45], roughness: 0.16, metallic: 0, normalStrength: 4 },
  simpleRock: { episode: 5, bvid: "BV1AF8HzZEex", label: "简单岩石", kind: "rock", seed: 5, scale: 5, detail: 4, wear: 0.32, color: [0.28, 0.27, 0.24], accentColor: [0.5, 0.47, 0.4], roughness: 0.88, metallic: 0, normalStrength: 5 },
  realisticConcreteWallA: { episode: 6, bvid: "BV1TyGtzgEw5", label: "写实水泥墙 A", kind: "concrete", seed: 6, scale: 6, detail: 4, wear: 0.38, color: [0.45, 0.45, 0.42], accentColor: [0.22, 0.23, 0.22], roughness: 0.86, metallic: 0, normalStrength: 3, variant: 0 },
  realisticConcreteWallB: { episode: 7, bvid: "BV1prdhYrECB", label: "写实水泥墙 B", kind: "concrete", seed: 7, scale: 8, detail: 5, wear: 0.45, color: [0.52, 0.5, 0.46], accentColor: [0.2, 0.21, 0.2], roughness: 0.9, metallic: 0, normalStrength: 4, variant: 1 },
  redWoodPlanks: { episode: 8, bvid: "BV1XuQaYmEh1", label: "红色木板", kind: "woodPlanks", seed: 8, scale: 7, detail: 4, wear: 0.42, color: [0.46, 0.07, 0.035], accentColor: [0.78, 0.24, 0.1], roughness: 0.7, metallic: 0, normalStrength: 3, variant: 1 },
  bambooBlind: { episode: 9, bvid: "BV1Xj9AYTETE", label: "竹帘", kind: "bambooBlind", seed: 9, scale: 8, detail: 3, wear: 0.2, color: [0.55, 0.38, 0.16], accentColor: [0.24, 0.13, 0.055], roughness: 0.72, metallic: 0, normalStrength: 4 },
  floorTiles: { episode: 10, bvid: "BV173FcesEN3", label: "地砖", kind: "floorTiles", seed: 10, scale: 6, detail: 3, wear: 0.28, color: [0.52, 0.48, 0.4], accentColor: [0.2, 0.19, 0.17], roughness: 0.62, metallic: 0, normalStrength: 4 },
  lanternPaper: { episode: 11, bvid: "BV1qmKLemEZM", label: "灯笼", kind: "lanternPaper", seed: 11, scale: 7, detail: 4, wear: 0.22, color: [0.76, 0.055, 0.025], accentColor: [0.2, 0.04, 0.02], roughness: 0.66, metallic: 0, normalStrength: 2 },
  bambooRaft: { episode: 12, bvid: "BV1Qu6UYaEgD", label: "竹排", kind: "bambooRaft", seed: 12, scale: 7, detail: 3, wear: 0.28, color: [0.46, 0.37, 0.14], accentColor: [0.25, 0.17, 0.06], roughness: 0.74, metallic: 0, normalStrength: 4 },
  volcanicRock: { episode: 13, bvid: "BV1RaBtYuEHh", label: "火山岩石", kind: "volcanicRock", seed: 13, scale: 7, detail: 5, wear: 0.32, color: [0.055, 0.045, 0.04], accentColor: [0.22, 0.075, 0.025], roughness: 0.96, metallic: 0, normalStrength: 6 },
  stylizedStoneColumn: { episode: 14, bvid: "BV15KmDYZEad", label: "风格化石柱", kind: "stoneColumn", seed: 14, scale: 6, detail: 3, wear: 0.36, color: [0.47, 0.45, 0.4], accentColor: [0.25, 0.24, 0.22], roughness: 0.84, metallic: 0, normalStrength: 5 },
  bamboo: { episode: 15, bvid: "BV1caSbYEEDi", label: "竹子", kind: "bamboo", seed: 15, scale: 7, detail: 3, wear: 0.18, color: [0.38, 0.48, 0.12], accentColor: [0.16, 0.25, 0.05], roughness: 0.62, metallic: 0, normalStrength: 4 },
  framedWindow: { episode: 16, bvid: "BV1MFxVerEFx", label: "窗户", kind: "window", seed: 16, scale: 6, detail: 3, wear: 0.25, color: [0.08, 0.2, 0.26], accentColor: [0.14, 0.17, 0.18], roughness: 0.12, metallic: 0, normalStrength: 3 },
  plasterWall: { episode: 17, bvid: "BV1CzpnejEYH", label: "墙面", kind: "plasterWall", seed: 17, scale: 6, detail: 4, wear: 0.42, color: [0.6, 0.55, 0.46], accentColor: [0.27, 0.24, 0.2], roughness: 0.88, metallic: 0, normalStrength: 3 },
  stylizedFloorTilesA: { episode: 18, bvid: "BV1W4WCemERJ", label: "风格化地砖 A", kind: "floorTiles", seed: 18, scale: 7, detail: 3, wear: 0.32, color: [0.34, 0.43, 0.45], accentColor: [0.13, 0.18, 0.19], roughness: 0.68, metallic: 0, normalStrength: 4, variant: 1 },
  meteorSurface: { episode: 19, bvid: "BV1tGexehEL3", label: "行星陨石表面", kind: "meteor", seed: 19, scale: 8, detail: 4, wear: 0.3, color: [0.18, 0.17, 0.16], accentColor: [0.42, 0.26, 0.12], roughness: 0.92, metallic: 0, normalStrength: 6 },
  stylizedGrass: { episode: 20, bvid: "BV1R7efeNE2Y", label: "风格化草地", kind: "grass", seed: 20, scale: 10, detail: 4, wear: 0.24, color: [0.14, 0.3, 0.045], accentColor: [0.46, 0.62, 0.12], roughness: 0.9, metallic: 0, normalStrength: 4 },
  stylizedRoad: { episode: 21, bvid: "BV17W421R7Jw", label: "风格化路面", kind: "road", seed: 21, scale: 8, detail: 5, wear: 0.4, color: [0.19, 0.18, 0.16], accentColor: [0.42, 0.34, 0.22], roughness: 0.93, metallic: 0, normalStrength: 5 },
  stylizedRoofTilesA: { episode: 22, bvid: "BV1zs421T75K", label: "风格化瓦片 A", kind: "roofTiles", seed: 22, scale: 8, detail: 3, wear: 0.28, color: [0.24, 0.35, 0.4], accentColor: [0.1, 0.16, 0.19], roughness: 0.74, metallic: 0, normalStrength: 5, variant: 0 },
  stylizedCoins: { episode: 23, bvid: "BV1PM4m1m7Di", label: "风格化金币", kind: "coins", seed: 23, scale: 6, detail: 3, wear: 0.3, color: [0.14, 0.08, 0.015], accentColor: [0.92, 0.58, 0.08], roughness: 0.34, metallic: 0, normalStrength: 5 },
  bambooBasket: { episode: 24, bvid: "BV1Ni421e7UJ", label: "竹篓编织", kind: "basketWeave", seed: 24, scale: 7, detail: 3, wear: 0.28, color: [0.32, 0.19, 0.07], accentColor: [0.68, 0.48, 0.2], roughness: 0.76, metallic: 0, normalStrength: 5 },
  stylizedBark: { episode: 25, bvid: "BV1BU411d7KR", label: "风格化树皮", kind: "bark", seed: 25, scale: 8, detail: 4, wear: 0.4, color: [0.18, 0.08, 0.025], accentColor: [0.48, 0.27, 0.08], roughness: 0.94, metallic: 0, normalStrength: 6 },
  realisticSteps: { episode: 26, bvid: "BV1A1421q75W", label: "写实台阶", kind: "steps", seed: 26, scale: 7, detail: 4, wear: 0.46, color: [0.42, 0.4, 0.36], accentColor: [0.18, 0.17, 0.15], roughness: 0.88, metallic: 0, normalStrength: 5 },
  stylizedStoneWall: { episode: 27, bvid: "BV1rr421E7Lu", label: "风格化石墙", kind: "stoneWall", seed: 27, scale: 6, detail: 4, wear: 0.42, color: [0.39, 0.38, 0.34], accentColor: [0.16, 0.17, 0.16], roughness: 0.9, metallic: 0, normalStrength: 5 },
  stylizedBurlap: { episode: 28, bvid: "BV15C411h7qo", label: "风格化麻布", kind: "burlap", seed: 28, scale: 9, detail: 3, wear: 0.3, color: [0.37, 0.25, 0.12], accentColor: [0.66, 0.49, 0.26], roughness: 0.94, metallic: 0, normalStrength: 5 },
  stylizedRoofTilesB: { episode: 29, bvid: "BV1VH4y1j7y8", label: "风格化瓦片 B", kind: "roofTiles", seed: 29, scale: 10, detail: 4, wear: 0.4, color: [0.47, 0.12, 0.055], accentColor: [0.2, 0.045, 0.025], roughness: 0.82, metallic: 0, normalStrength: 6, variant: 1 },
  stylizedMarble: { episode: 30, bvid: "BV1mK42187NF", label: "风格化大理石", kind: "marble", seed: 30, scale: 6, detail: 4, wear: 0.14, color: [0.72, 0.68, 0.62], accentColor: [0.16, 0.25, 0.31], roughness: 0.24, metallic: 0, normalStrength: 2 },
  stylizedRedWall: { episode: 31, bvid: "BV1Wa411U7Dx", label: "风格化红墙", kind: "redWall", seed: 31, scale: 6, detail: 4, wear: 0.46, color: [0.55, 0.07, 0.035], accentColor: [0.2, 0.025, 0.015], roughness: 0.86, metallic: 0, normalStrength: 4 },
  stylizedFloorTilesB: { episode: 32, bvid: "BV1xa411Z7FM", label: "风格化地砖 B", kind: "floorTiles", seed: 32, scale: 5, detail: 4, wear: 0.38, color: [0.46, 0.32, 0.18], accentColor: [0.18, 0.13, 0.09], roughness: 0.76, metallic: 0, normalStrength: 5, variant: 2 },
  stylizedWood: { episode: 33, bvid: "BV1wd4y1K7Fi", label: "风格化木头", kind: "woodPlanks", seed: 33, scale: 6, detail: 5, wear: 0.36, color: [0.29, 0.16, 0.055], accentColor: [0.62, 0.39, 0.15], roughness: 0.78, metallic: 0, normalStrength: 5, variant: 2 },
  stylizedBrickWall: { episode: 34, bvid: "BV16P41157px", label: "风格化砖墙", kind: "brickWall", seed: 34, scale: 7, detail: 4, wear: 0.4, color: [0.55, 0.17, 0.08], accentColor: [0.19, 0.14, 0.1], roughness: 0.88, metallic: 0, normalStrength: 5 },
  stylizedCarpet: { episode: 35, bvid: "BV1iT411F7Fd", label: "风格化地毯", kind: "carpet", seed: 35, scale: 10, detail: 4, wear: 0.24, color: [0.17, 0.08, 0.12], accentColor: [0.62, 0.31, 0.18], roughness: 0.98, metallic: 0, normalStrength: 4 },
  stylizedGround: { episode: 36, bvid: "BV1z14y1s7JR", label: "风格化地面", kind: "pebbledGround", seed: 36, scale: 6, detail: 4, wear: 0.38, color: [0.34, 0.26, 0.16], accentColor: [0.55, 0.43, 0.28], roughness: 0.92, metallic: 0, normalStrength: 5, variant: 1 },
  stylizedDesert: { episode: 37, bvid: "BV1j24y1o7FT", label: "风格化沙漠", kind: "desert", seed: 37, scale: 7, detail: 4, wear: 0.24, color: [0.58, 0.31, 0.12], accentColor: [0.9, 0.62, 0.28], roughness: 0.9, metallic: 0, normalStrength: 4 },
  stylizedSnow: { episode: 38, bvid: "BV1dm4y1c7Zy", label: "风格化雪地", kind: "snow", seed: 38, scale: 6, detail: 5, wear: 0.16, color: [0.62, 0.72, 0.78], accentColor: [0.95, 0.98, 1], roughness: 0.62, metallic: 0, normalStrength: 3 },
} as const satisfies Record<string, BilibiliMaterialDefinition>;

export type BilibiliMaterialName = keyof typeof BILIBILI_MATERIAL_DEFINITIONS;

function recipe(name: BilibiliMaterialName) {
  return (params: BilibiliMaterialParams = {}) => buildBilibiliMaterial(BILIBILI_MATERIAL_DEFINITIONS[name], params);
}

export const BILIBILI_MATERIALS = {
  stylizedColumn: recipe("stylizedColumn"),
  earthyGround: recipe("earthyGround"),
  stylizedWoodPlanks: recipe("stylizedWoodPlanks"),
  glassBlocks: recipe("glassBlocks"),
  simpleRock: recipe("simpleRock"),
  realisticConcreteWallA: recipe("realisticConcreteWallA"),
  realisticConcreteWallB: recipe("realisticConcreteWallB"),
  redWoodPlanks: recipe("redWoodPlanks"),
  bambooBlind: recipe("bambooBlind"),
  floorTiles: recipe("floorTiles"),
  lanternPaper: recipe("lanternPaper"),
  bambooRaft: recipe("bambooRaft"),
  volcanicRock: recipe("volcanicRock"),
  stylizedStoneColumn: recipe("stylizedStoneColumn"),
  bamboo: recipe("bamboo"),
  framedWindow: recipe("framedWindow"),
  plasterWall: recipe("plasterWall"),
  stylizedFloorTilesA: recipe("stylizedFloorTilesA"),
  meteorSurface: recipe("meteorSurface"),
  stylizedGrass: recipe("stylizedGrass"),
  stylizedRoad: recipe("stylizedRoad"),
  stylizedRoofTilesA: recipe("stylizedRoofTilesA"),
  stylizedCoins: recipe("stylizedCoins"),
  bambooBasket: recipe("bambooBasket"),
  stylizedBark: recipe("stylizedBark"),
  realisticSteps: recipe("realisticSteps"),
  stylizedStoneWall: recipe("stylizedStoneWall"),
  stylizedBurlap: recipe("stylizedBurlap"),
  stylizedRoofTilesB: recipe("stylizedRoofTilesB"),
  stylizedMarble: recipe("stylizedMarble"),
  stylizedRedWall: recipe("stylizedRedWall"),
  stylizedFloorTilesB: recipe("stylizedFloorTilesB"),
  stylizedWood: recipe("stylizedWood"),
  stylizedBrickWall: recipe("stylizedBrickWall"),
  stylizedCarpet: recipe("stylizedCarpet"),
  stylizedGround: recipe("stylizedGround"),
  stylizedDesert: recipe("stylizedDesert"),
  stylizedSnow: recipe("stylizedSnow"),
} as const;

export const BILIBILI_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(BILIBILI_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 100, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 2, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "wear", label: "磨损程度", type: "range", min: 0, max: 1, step: 0.02, default: definition.wear },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies BilibiliMaterialParamSpec[]]),
) as Record<BilibiliMaterialName, BilibiliMaterialParamSpec[]>;

export function defaultBilibiliMaterialParams(name: BilibiliMaterialName): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const spec of BILIBILI_MATERIAL_PARAM_SCHEMA[name]) {
    params[spec.key] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  return params;
}
