import { clamp } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { blendColor, voronoi } from "./patterns.js";
import type { MaterialFields } from "./pbr.js";

type RGB = [number, number, number];

type StyleCaseKind =
  | "rootedEarth"
  | "weatheredCliff"
  | "basketWeave"
  | "mossStone"
  | "mushroomStrata"
  | "rubbleWall"
  | "bandedRock"
  | "emblemStone"
  | "diamondInlay"
  | "crystalCluster"
  | "oreVeins"
  | "marbleVeins"
  | "mossCobble"
  | "overgrownSoil"
  | "stoneMosaic"
  | "sciFiPanel"
  | "mossyStrata"
  | "wetPebbles"
  | "fernRock"
  | "rustedHatch"
  | "techTiles"
  | "slattedPanel"
  | "mossRoof"
  | "mossPebbles"
  | "dressedStone"
  | "brickWall";

export interface StyleCaseParams {
  seed?: number;
  scale?: number;
  detail?: number;
  wear?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface StyleCaseParamSpec {
  key: keyof StyleCaseParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface StyleCaseDefinition {
  episode: number;
  bvid: "BV1BtxNzfE8H";
  label: string;
  kind: StyleCaseKind;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  metallic: number;
  normalStrength: number;
}

interface PatternContext {
  definition: StyleCaseDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: (u: number, v: number) => number;
  edges: (u: number, v: number) => number;
  scale: number;
  detail: number;
}

interface PatternSample {
  height: number;
  accent: number;
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

function smoothstep(low: number, high: number, value: number): number {
  const range = high - low;
  const t = Math.abs(range) < 1e-6
    ? (value < low ? 0 : 1)
    : clamp01((value - low) / range);
  return t * t * (3 - 2 * t);
}

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

function gridSample(u: number, v: number, columns: number, rows: number, gap: number, stagger = 0) {
  const row = Math.floor(v * rows);
  const shifted = u * columns + (row % 2) * stagger;
  const localX = fract(shifted);
  const localY = fract(v * rows);
  const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
  const inside = smoothstep(gap, gap * 1.8, edge);
  return { localX, localY, edge, inside, column: Math.floor(shifted), row };
}

function leafMask(u: number, v: number, density: number, seed: number): number {
  const cellX = Math.floor(u * density);
  const cellY = Math.floor(v * density);
  const localX = fract(u * density) - 0.5;
  const localY = fract(v * density) - 0.5;
  const angle = hash2(cellX, cellY, seed) * TAU;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = localX * cosine - localY * sine;
  const y = localX * sine + localY * cosine;
  const width = 0.08 + hash2(cellX, cellY, seed + 3) * 0.12;
  const blade = smoothstep(width, width * 0.28, Math.abs(x))
    * smoothstep(0.48, 0.12, Math.abs(y));
  return blade * smoothstep(0.28, 0.62, hash2(cellX, cellY, seed + 7));
}

function samplePattern(context: PatternContext, u: number, v: number): PatternSample {
  const { definition, noise, detailNoise, cells, edges, scale, detail } = context;
  const x = u * scale;
  const y = v * scale;
  const low = fbm2(noise, x, y, { octaves: 4 }) * 0.5 + 0.5;
  const fine = fbm2(detailNoise, x * detail * 3, y * detail * 3, { octaves: 3 }) * 0.5 + 0.5;
  const cell = cells(u, v);
  const edge = edges(u, v);
  const crack = 1 - smoothstep(0.015, 0.12, edge);

  switch (definition.kind) {
    case "rootedEarth": {
      const branchA = 1 - smoothstep(0.02, 0.085, Math.abs(Math.sin((u * 1.7 + low * 0.22) * TAU)));
      const branchB = 1 - smoothstep(0.02, 0.065, Math.abs(Math.sin((u * 3.1 - v * 0.7 + fine * 0.12) * TAU)));
      const roots = Math.max(branchA, branchB * 0.7) * smoothstep(0.18, 0.82, low);
      return { height: clamp01(0.3 + low * 0.34 + roots * 0.35 - crack * 0.18), accent: roots, variation: low * 0.72 + fine * 0.28, wearMask: crack, roughness: 0.84 + fine * 0.12, ao: 1 - crack * 0.45 };
    }
    case "weatheredCliff": {
      const strata = 0.5 + Math.sin((v * scale * 0.9 + low * 0.7) * TAU) * 0.5;
      const ledge = Math.pow(strata, 1.9);
      return { height: clamp01(0.18 + ledge * 0.56 + low * 0.2 - crack * 0.15), accent: crack, variation: strata * 0.55 + fine * 0.45, wearMask: crack + (1 - ledge) * 0.2, roughness: 0.86 + fine * 0.1, ao: 0.62 + ledge * 0.38 };
    }
    case "basketWeave": {
      const frequency = Math.max(8, scale * 2.2);
      const warp = Math.pow(0.5 + Math.cos((u + v) * frequency * Math.PI) * 0.5, 0.8);
      const weft = Math.pow(0.5 + Math.cos((u - v) * frequency * Math.PI) * 0.5, 0.8);
      const over = Math.floor((u + v) * frequency * 0.5) % 2 === 0 ? warp : weft;
      return { height: clamp01(0.15 + over * 0.72 + fine * 0.08), accent: 1 - over, variation: low * 0.35 + over * 0.65, wearMask: 1 - over, roughness: 0.7 + fine * 0.16, ao: 0.58 + over * 0.42 };
    }
    case "mossStone":
    case "mossCobble":
    case "dressedStone": {
      const rows = definition.kind === "dressedStone" ? scale * 1.4 : scale;
      const tile = gridSample(u, v, Math.max(3, Math.round(scale)), Math.max(3, Math.round(rows)), 0.045, 0.5);
      const stone = tile.inside * smoothstep(0.03, 0.18, tile.edge);
      const moss = clamp01((1 - tile.inside) * 1.25 + crack * 0.45) * smoothstep(0.36, 0.72, low);
      return { height: clamp01(0.12 + stone * (0.62 + low * 0.15) + moss * 0.12 + fine * 0.05), accent: definition.kind === "dressedStone" ? 1 - tile.inside : moss, variation: hash2(tile.column, tile.row, definition.seed) * 0.65 + fine * 0.35, wearMask: 1 - tile.inside, roughness: 0.78 + moss * 0.18, ao: 1 - (1 - tile.inside) * 0.55 };
    }
    case "mushroomStrata": {
      const band = fract(v * scale + low * 0.55);
      const cap = smoothstep(0.02, 0.18, band) * (1 - smoothstep(0.45, 0.86, band));
      const drip = smoothstep(0.1, 0.92, fine) * smoothstep(0.35, 0.02, Math.abs(fract(u * scale * 1.7) - 0.5));
      return { height: clamp01(0.12 + cap * 0.64 + drip * cap * 0.28), accent: 1 - cap, variation: cap * 0.55 + low * 0.45, wearMask: 1 - cap, roughness: 0.8 + fine * 0.14, ao: 0.55 + cap * 0.45 };
    }
    case "rubbleWall":
    case "stoneMosaic": {
      const stone = smoothstep(0.02, 0.19, edge);
      const fragment = definition.kind === "stoneMosaic" ? Math.pow(stone, 0.7) : stone;
      return { height: clamp01(0.08 + fragment * (0.62 + low * 0.2) + fine * 0.05), accent: 1 - fragment, variation: low * 0.55 + fine * 0.45, wearMask: crack, roughness: 0.82 + fine * 0.12, ao: 1 - crack * 0.58 };
    }
    case "bandedRock": {
      const strata = 0.5 + Math.sin((v * scale + low * 0.9) * TAU) * 0.5;
      const braid = 0.5 + Math.sin((u * scale * 1.7 + v * scale * 0.55) * TAU) * 0.5;
      const band = smoothstep(0.7, 0.92, strata) * braid;
      return { height: clamp01(0.18 + strata * 0.52 + band * 0.24 + fine * 0.06), accent: band, variation: low * 0.45 + strata * 0.55, wearMask: 1 - strata, roughness: 0.8 + fine * 0.14, ao: 0.62 + strata * 0.38 };
    }
    case "emblemStone": {
      const dx = u - 0.5;
      const dy = v - 0.5;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const ring = 1 - smoothstep(0.018, 0.055, Math.abs(radius - 0.31));
      const petals = 1 - smoothstep(0.018, 0.06, Math.abs(radius - (0.19 + Math.cos(angle * 8) * 0.035)));
      const emblem = Math.max(ring, petals);
      return { height: clamp01(0.42 + emblem * 0.38 + (low - 0.5) * 0.16), accent: emblem, variation: low * 0.65 + fine * 0.35, wearMask: crack, roughness: 0.76 + fine * 0.12, ao: 1 - emblem * 0.1 };
    }
    case "diamondInlay": {
      const diamond = Math.abs(u - 0.5) + Math.abs(v - 0.5);
      const line = 1 - smoothstep(0.018, 0.055, Math.abs(diamond - 0.3));
      const stem = (1 - smoothstep(0.015, 0.045, Math.abs(u - 0.5))) * smoothstep(0.27, 0.42, diamond);
      const inlay = Math.max(line, stem);
      return { height: clamp01(0.38 + inlay * 0.4 + (low - 0.5) * 0.2), accent: inlay, variation: low * 0.72 + fine * 0.28, wearMask: crack + inlay * fine * 0.2, metallic: inlay * 0.85, roughness: 0.76 - inlay * 0.48 + fine * 0.08, ao: 1 - inlay * 0.16 };
    }
    case "crystalCluster": {
      const columns = Math.max(4, Math.round(scale));
      const localX = fract(u * columns) - 0.5;
      const localY = fract(v * columns) - 0.5;
      const crystal = smoothstep(0.48, 0.08, Math.abs(localX) * 1.5 + Math.abs(localY)) * smoothstep(0.3, 0.72, hash2(Math.floor(u * columns), Math.floor(v * columns), definition.seed));
      const ridge = crystal * (0.5 + Math.cos(Math.atan2(localY, localX) * 5) * 0.5);
      return { height: clamp01(0.14 + crystal * 0.66 + ridge * 0.22), accent: crystal, variation: ridge, wearMask: 1 - crystal, roughness: 0.42 + (1 - crystal) * 0.42, ao: 0.72 + crystal * 0.28, emission: [crystal * 0.18, crystal * 0.015, crystal * 0.24] };
    }
    case "oreVeins":
    case "marbleVeins": {
      const veinNoise = fbm2(noise, u * scale * 0.65, v * scale * 1.1, { octaves: 5 });
      const vein = 1 - smoothstep(0.03, definition.kind === "oreVeins" ? 0.16 : 0.1, Math.abs(Math.sin((u * 1.2 + veinNoise * 0.7) * TAU)));
      return { height: clamp01(0.4 + (low - 0.5) * 0.2 + vein * (definition.kind === "oreVeins" ? 0.28 : 0.1)), accent: vein, variation: low * 0.6 + fine * 0.4, wearMask: crack, roughness: definition.kind === "oreVeins" ? 0.72 - vein * 0.28 : 0.36 + fine * 0.12, metallic: definition.kind === "oreVeins" ? vein * 0.55 : 0, ao: 1 - crack * 0.22, emission: definition.kind === "oreVeins" ? [vein * 0.02, vein * 0.18, vein * 0.16] : [0, 0, 0] };
    }
    case "overgrownSoil": {
      const blade = leafMask(u, v, Math.max(12, scale * 2.5), definition.seed);
      return { height: clamp01(0.25 + low * 0.4 + blade * 0.32), accent: blade, variation: low * 0.55 + fine * 0.45, wearMask: crack, roughness: 0.88 + fine * 0.09, ao: 0.72 + blade * 0.28 };
    }
    case "sciFiPanel":
    case "techTiles": {
      const tile = gridSample(u, v, Math.max(3, Math.round(scale * 0.65)), Math.max(3, Math.round(scale * 0.65)), 0.035);
      const channels = Math.max(
        1 - smoothstep(0.012, 0.04, Math.abs(fract((u + low * 0.025) * scale) - 0.5)),
        1 - smoothstep(0.012, 0.04, Math.abs(fract((v + low * 0.025) * scale) - 0.5)),
      );
      const node = 1 - smoothstep(0.045, 0.12, Math.hypot(tile.localX - 0.5, tile.localY - 0.5));
      const panel = Math.max(1 - tile.inside, channels, definition.kind === "techTiles" ? node : 0);
      return { height: clamp01(0.35 + tile.inside * 0.18 + panel * 0.32 + fine * 0.04), accent: panel, variation: low * 0.45 + fine * 0.55, wearMask: crack * 0.35, metallic: 0.72 + panel * 0.22, roughness: 0.38 + fine * 0.18, ao: 1 - panel * 0.22 };
    }
    case "mossyStrata": {
      const layer = 0.5 + Math.sin((v * scale + low * 0.75) * TAU) * 0.5;
      const moss = smoothstep(0.62, 0.88, low) * smoothstep(0.4, 0.8, layer);
      return { height: clamp01(0.16 + layer * 0.58 + fine * 0.08), accent: moss, variation: low * 0.42 + layer * 0.58, wearMask: 1 - layer, roughness: 0.84 + moss * 0.12, ao: 0.58 + layer * 0.42 };
    }
    case "wetPebbles":
    case "mossPebbles": {
      const pebble = smoothstep(0.48, 0.1, cell);
      const organic = definition.kind === "mossPebbles" ? smoothstep(0.5, 0.76, low) * (1 - pebble * 0.45) : 0;
      return { height: clamp01(0.14 + pebble * 0.58 + low * 0.12 + fine * 0.06), accent: organic, variation: low * 0.52 + pebble * 0.48, wearMask: 1 - pebble, roughness: definition.kind === "wetPebbles" ? 0.22 + (1 - pebble) * 0.18 : 0.82 + organic * 0.14, ao: 0.62 + pebble * 0.38 };
    }
    case "fernRock": {
      const stone = smoothstep(0.46, 0.12, cell);
      const leaves = leafMask(u, v, Math.max(8, scale * 1.45), definition.seed);
      return { height: clamp01(0.16 + stone * 0.54 + leaves * 0.3 + fine * 0.05), accent: leaves, variation: low * 0.55 + stone * 0.45, wearMask: 1 - stone, roughness: 0.8 + leaves * 0.16, ao: 0.7 + Math.max(stone, leaves) * 0.3 };
    }
    case "rustedHatch": {
      const dx = u - 0.5;
      const dy = v - 0.5;
      const radius = Math.hypot(dx, dy);
      const disc = smoothstep(0.46, 0.41, radius);
      const rim = 1 - smoothstep(0.018, 0.05, Math.abs(radius - 0.39));
      const seam = disc * (1 - smoothstep(0.012, 0.035, Math.abs(dx)));
      const rust = smoothstep(0.58, 0.78, low) * disc;
      return { height: clamp01(0.2 + disc * 0.34 + rim * 0.34 - seam * 0.16 + fine * 0.05), accent: rust, variation: low * 0.72 + fine * 0.28, wearMask: rust + seam, metallic: disc * (1 - rust * 0.72), roughness: 0.38 + rust * 0.5, ao: 1 - seam * 0.42 };
    }
    case "slattedPanel": {
      const local = fract(v * Math.max(5, scale));
      const slat = smoothstep(0.05, 0.16, Math.min(local, 1 - local));
      const bevel = Math.sin(local * Math.PI);
      return { height: clamp01(0.15 + slat * 0.46 + bevel * 0.18 + low * 0.08 + fine * 0.05), accent: 1 - slat, variation: low * 0.35 + bevel * 0.65, wearMask: 1 - slat, metallic: 0.72, roughness: 0.42 + fine * 0.15, ao: 0.58 + slat * 0.42 };
    }
    case "mossRoof": {
      const rows = Math.max(5, Math.round(scale));
      const row = Math.floor(v * rows);
      const localX = fract(u * rows * 0.72 + (row % 2) * 0.5) - 0.5;
      const localY = fract(v * rows);
      const arch = smoothstep(0.5, 0.1, Math.abs(localX)) * smoothstep(0.05, 0.25, localY) * (1 - smoothstep(0.72, 0.98, localY));
      const moss = smoothstep(0.55, 0.8, low) * arch;
      return { height: clamp01(0.12 + arch * 0.76 + fine * 0.05), accent: moss, variation: low * 0.5 + arch * 0.5, wearMask: 1 - arch, roughness: 0.76 + moss * 0.2, ao: 0.55 + arch * 0.45 };
    }
    case "brickWall": {
      const tile = gridSample(u, v, Math.max(4, Math.round(scale)), Math.max(6, Math.round(scale * 1.7)), 0.045, 0.5);
      const brick = tile.inside * smoothstep(0.035, 0.16, tile.edge);
      return { height: clamp01(0.12 + brick * (0.64 + low * 0.12) + fine * 0.05), accent: 1 - tile.inside, variation: hash2(tile.column, tile.row, definition.seed) * 0.68 + fine * 0.32, wearMask: 1 - brick, roughness: 0.82 + fine * 0.12, ao: 1 - (1 - tile.inside) * 0.58 };
    }
  }
}

export function buildStyleCaseMaterial(
  definition: StyleCaseDefinition,
  params: StyleCaseParams = {},
): MaterialFields {
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const wear = params.wear ?? definition.wear;
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughness = params.roughness ?? definition.roughness;
  const context: PatternContext = {
    definition,
    noise: makeNoise(seed),
    detailNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(3, scale * detail * 0.75), seed: seed + 13, metric: "f1" }),
    edges: voronoi({ scale: Math.max(2, scale * 0.9), seed: seed + 29, metric: "f2-f1" }),
    scale,
    detail,
  };
  const sample = (u: number, v: number) => samplePattern(context, u, v);

  return {
    baseColor: (u, v) => {
      const result = sample(u, v);
      const mixed = blendColor(color, accentColor, clamp01(result.accent));
      return shade(mixed, 0.76 + result.variation * 0.34 - clamp01(result.wearMask) * wear * 0.2);
    },
    metallic: (u, v) => clamp01(sample(u, v).metallic ?? definition.metallic),
    roughness: (u, v) => clamp(sample(u, v).roughness ?? roughness, 0.04, 1),
    ao: (u, v) => clamp01(sample(u, v).ao ?? 1),
    height: (u, v) => clamp01(sample(u, v).height),
    emission: (u, v) => sample(u, v).emission ?? [0, 0, 0],
    normalStrength: definition.normalStrength,
    tileable: !["emblemStone", "diamondInlay", "rustedHatch"].includes(definition.kind),
  };
}

export const STYLE_CASE_DEFINITIONS = {
  rootedForestEarth: { episode: 1, bvid: "BV1BtxNzfE8H", label: "根蔓森林泥土", kind: "rootedEarth", seed: 401, scale: 7, detail: 4, wear: 0.34, color: [0.19, 0.13, 0.08], accentColor: [0.04, 0.34, 0.2], roughness: 0.9, metallic: 0, normalStrength: 6 },
  weatheredCliff: { episode: 2, bvid: "BV1BtxNzfE8H", label: "风化层岩", kind: "weatheredCliff", seed: 402, scale: 6, detail: 4, wear: 0.3, color: [0.38, 0.28, 0.17], accentColor: [0.62, 0.47, 0.28], roughness: 0.88, metallic: 0, normalStrength: 6 },
  wovenRattan: { episode: 3, bvid: "BV1BtxNzfE8H", label: "藤条编织", kind: "basketWeave", seed: 403, scale: 8, detail: 3, wear: 0.24, color: [0.24, 0.11, 0.055], accentColor: [0.64, 0.34, 0.16], roughness: 0.72, metallic: 0, normalStrength: 5 },
  mossStoneBlocks: { episode: 4, bvid: "BV1BtxNzfE8H", label: "苔藓石块", kind: "mossStone", seed: 404, scale: 6, detail: 4, wear: 0.38, color: [0.29, 0.34, 0.36], accentColor: [0.16, 0.52, 0.12], roughness: 0.84, metallic: 0, normalStrength: 6 },
  mushroomStrata: { episode: 5, bvid: "BV1BtxNzfE8H", label: "层叠菌褶岩", kind: "mushroomStrata", seed: 405, scale: 7, detail: 4, wear: 0.28, color: [0.38, 0.24, 0.13], accentColor: [0.72, 0.49, 0.27], roughness: 0.86, metallic: 0, normalStrength: 7 },
  rubbleStoneWall: { episode: 6, bvid: "BV1BtxNzfE8H", label: "杂砌石墙", kind: "rubbleWall", seed: 406, scale: 6, detail: 4, wear: 0.4, color: [0.34, 0.3, 0.25], accentColor: [0.13, 0.28, 0.11], roughness: 0.9, metallic: 0, normalStrength: 6 },
  ornamentalStrata: { episode: 7, bvid: "BV1BtxNzfE8H", label: "纹带层岩", kind: "bandedRock", seed: 407, scale: 7, detail: 4, wear: 0.34, color: [0.43, 0.31, 0.18], accentColor: [0.34, 0.5, 0.14], roughness: 0.86, metallic: 0, normalStrength: 6 },
  carvedStoneEmblem: { episode: 8, bvid: "BV1BtxNzfE8H", label: "雕刻石徽章", kind: "emblemStone", seed: 408, scale: 5, detail: 4, wear: 0.35, color: [0.42, 0.4, 0.35], accentColor: [0.18, 0.17, 0.16], roughness: 0.8, metallic: 0, normalStrength: 5 },
  crackedDiamondInlay: { episode: 9, bvid: "BV1BtxNzfE8H", label: "裂纹菱形镶嵌", kind: "diamondInlay", seed: 409, scale: 5, detail: 4, wear: 0.42, color: [0.18, 0.2, 0.19], accentColor: [0.55, 0.04, 0.08], roughness: 0.66, metallic: 0.22, normalStrength: 5 },
  amethystCluster: { episode: 10, bvid: "BV1BtxNzfE8H", label: "紫晶簇", kind: "crystalCluster", seed: 410, scale: 7, detail: 3, wear: 0.14, color: [0.2, 0.19, 0.24], accentColor: [0.72, 0.08, 0.78], roughness: 0.38, metallic: 0, normalStrength: 7 },
  turquoiseOre: { episode: 11, bvid: "BV1BtxNzfE8H", label: "青绿矿脉", kind: "oreVeins", seed: 411, scale: 6, detail: 5, wear: 0.28, color: [0.12, 0.11, 0.1], accentColor: [0.08, 0.78, 0.65], roughness: 0.68, metallic: 0.12, normalStrength: 5 },
  goldenMarble: { episode: 12, bvid: "BV1BtxNzfE8H", label: "金脉大理石", kind: "marbleVeins", seed: 412, scale: 6, detail: 5, wear: 0.12, color: [0.72, 0.65, 0.49], accentColor: [0.95, 0.75, 0.28], roughness: 0.36, metallic: 0, normalStrength: 3 },
  mossCobblestone: { episode: 13, bvid: "BV1BtxNzfE8H", label: "苔藓鹅卵石路", kind: "mossCobble", seed: 413, scale: 7, detail: 4, wear: 0.4, color: [0.34, 0.35, 0.31], accentColor: [0.23, 0.52, 0.1], roughness: 0.9, metallic: 0, normalStrength: 6 },
  overgrownSoil: { episode: 14, bvid: "BV1BtxNzfE8H", label: "草蔓侵蚀土", kind: "overgrownSoil", seed: 414, scale: 7, detail: 5, wear: 0.36, color: [0.3, 0.24, 0.16], accentColor: [0.18, 0.48, 0.1], roughness: 0.92, metallic: 0, normalStrength: 5 },
  fragmentedStoneMosaic: { episode: 15, bvid: "BV1BtxNzfE8H", label: "碎石拼花", kind: "stoneMosaic", seed: 415, scale: 8, detail: 4, wear: 0.36, color: [0.44, 0.45, 0.42], accentColor: [0.18, 0.18, 0.17], roughness: 0.88, metallic: 0, normalStrength: 6 },
  sciFiCircuitPanel: { episode: 16, bvid: "BV1BtxNzfE8H", label: "科幻电路面板", kind: "sciFiPanel", seed: 416, scale: 6, detail: 3, wear: 0.3, color: [0.18, 0.22, 0.21], accentColor: [0.08, 0.52, 0.44], roughness: 0.42, metallic: 0.82, normalStrength: 4 },
  mossyLayeredRock: { episode: 17, bvid: "BV1BtxNzfE8H", label: "苔藓层状岩", kind: "mossyStrata", seed: 417, scale: 7, detail: 4, wear: 0.34, color: [0.44, 0.32, 0.2], accentColor: [0.19, 0.48, 0.1], roughness: 0.88, metallic: 0, normalStrength: 6 },
  wetPebbleGround: { episode: 18, bvid: "BV1BtxNzfE8H", label: "湿润卵石地", kind: "wetPebbles", seed: 418, scale: 8, detail: 4, wear: 0.22, color: [0.16, 0.2, 0.19], accentColor: [0.42, 0.47, 0.42], roughness: 0.26, metallic: 0, normalStrength: 5 },
  fernCoveredRock: { episode: 19, bvid: "BV1BtxNzfE8H", label: "蕨叶覆石", kind: "fernRock", seed: 419, scale: 7, detail: 4, wear: 0.32, color: [0.28, 0.24, 0.19], accentColor: [0.05, 0.58, 0.38], roughness: 0.88, metallic: 0, normalStrength: 6 },
  rustedRoundHatch: { episode: 20, bvid: "BV1BtxNzfE8H", label: "锈蚀圆舱门", kind: "rustedHatch", seed: 420, scale: 6, detail: 5, wear: 0.55, color: [0.42, 0.44, 0.42], accentColor: [0.58, 0.22, 0.06], roughness: 0.48, metallic: 0.72, normalStrength: 5 },
  modularTechTiles: { episode: 21, bvid: "BV1BtxNzfE8H", label: "模块科技地砖", kind: "techTiles", seed: 421, scale: 6, detail: 3, wear: 0.38, color: [0.34, 0.4, 0.4], accentColor: [0.46, 0.2, 0.09], roughness: 0.48, metallic: 0.74, normalStrength: 4 },
  industrialSlats: { episode: 22, bvid: "BV1BtxNzfE8H", label: "工业横向百叶", kind: "slattedPanel", seed: 422, scale: 8, detail: 4, wear: 0.34, color: [0.22, 0.26, 0.26], accentColor: [0.65, 0.39, 0.14], roughness: 0.46, metallic: 0.76, normalStrength: 5 },
  mossRoofShingles: { episode: 23, bvid: "BV1BtxNzfE8H", label: "苔藓鱼鳞瓦", kind: "mossRoof", seed: 423, scale: 9, detail: 4, wear: 0.42, color: [0.2, 0.26, 0.25], accentColor: [0.18, 0.48, 0.08], roughness: 0.84, metallic: 0, normalStrength: 6 },
  mossyRiverPebbles: { episode: 24, bvid: "BV1BtxNzfE8H", label: "苔藓河卵石", kind: "mossPebbles", seed: 424, scale: 7, detail: 4, wear: 0.4, color: [0.31, 0.27, 0.21], accentColor: [0.26, 0.48, 0.1], roughness: 0.86, metallic: 0, normalStrength: 6 },
  dressedStoneWall: { episode: 25, bvid: "BV1BtxNzfE8H", label: "整砌风化石墙", kind: "dressedStone", seed: 425, scale: 7, detail: 4, wear: 0.4, color: [0.43, 0.39, 0.31], accentColor: [0.22, 0.2, 0.17], roughness: 0.88, metallic: 0, normalStrength: 6 },
  weatheredBrickWall: { episode: 26, bvid: "BV1BtxNzfE8H", label: "风化砖墙", kind: "brickWall", seed: 426, scale: 8, detail: 4, wear: 0.46, color: [0.39, 0.21, 0.13], accentColor: [0.2, 0.18, 0.15], roughness: 0.9, metallic: 0, normalStrength: 6 },
} as const satisfies Record<string, StyleCaseDefinition>;

export type StyleCaseName = keyof typeof STYLE_CASE_DEFINITIONS;

function recipe(name: StyleCaseName) {
  return (params: StyleCaseParams = {}) => buildStyleCaseMaterial(STYLE_CASE_DEFINITIONS[name], params);
}

export const STYLE_CASE_MATERIALS = Object.fromEntries(
  (Object.keys(STYLE_CASE_DEFINITIONS) as StyleCaseName[]).map((name) => [name, recipe(name)]),
) as Record<StyleCaseName, (params?: StyleCaseParams) => MaterialFields>;

export const STYLE_CASE_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(STYLE_CASE_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 2, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "wear", label: "磨损程度", type: "range", min: 0, max: 1, step: 0.02, default: definition.wear },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies StyleCaseParamSpec[]]),
) as Record<StyleCaseName, StyleCaseParamSpec[]>;

export function defaultStyleCaseParams(name: StyleCaseName): Record<string, unknown> {
  return Object.fromEntries(STYLE_CASE_PARAM_SCHEMA[name].map((spec) => [
    spec.key,
    Array.isArray(spec.default) ? [...spec.default] : spec.default,
  ]));
}
