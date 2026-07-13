import { clamp } from "../math/scalar.js";
import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { blendColor, voronoi } from "./patterns.js";
import type { MaterialFields } from "./pbr.js";

type RGB = [number, number, number];

type ProductionStudyKind =
  | "solarPanel"
  | "anodizedAluminum"
  | "diamondPlate"
  | "roadMarking"
  | "efflorescentConcrete"
  | "plywoodEdge"
  | "terrazzo"
  | "chainmail";

export interface ProductionStudyParams {
  seed?: number;
  scale?: number;
  detail?: number;
  wear?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface ProductionStudyParamSpec {
  key: keyof ProductionStudyParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface ProductionStudyDefinition {
  label: string;
  focus: string;
  kind: ProductionStudyKind;
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
  definition: ProductionStudyDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: (u: number, v: number) => number;
  cellValues: (u: number, v: number) => number;
  edges: (u: number, v: number) => number;
  scale: number;
  detail: number;
  wear: number;
}

interface PatternSample {
  height: number;
  accent: number;
  variation: number;
  roughness: number;
  metallic: number;
  ao: number;
  emission?: RGB;
}

const TAU = Math.PI * 2;
const clamp01 = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);

function smoothstep(low: number, high: number, value: number): number {
  const range = high - low;
  const normalized = Math.abs(range) < 1e-6
    ? (value < low ? 0 : 1)
    : clamp01((value - low) / range);
  return normalized * normalized * (3 - 2 * normalized);
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

function samplePattern(context: PatternContext, u: number, v: number): PatternSample {
  const { definition, noise, detailNoise, cells, cellValues, edges, scale, detail, wear } = context;
  const low = fbm2(noise, u * scale, v * scale, { octaves: Math.max(2, Math.round(detail)) }) * 0.5 + 0.5;
  const fine = fbm2(detailNoise, u * scale * detail * 5, v * scale * detail * 5, { octaves: 3 }) * 0.5 + 0.5;
  const edge = edges(u, v);

  switch (definition.kind) {
    case "solarPanel": {
      const columns = Math.max(4, Math.round(scale));
      const cell = gridSample(u, v, columns, columns * 2, 0.022, 0);
      const busbarX = 1 - smoothstep(0.025, 0.065, Math.abs(cell.localX - 0.5));
      const fingers = 1 - smoothstep(0.012, 0.03, Math.abs(fract(cell.localY * 5) - 0.5));
      const frame = 1 - smoothstep(0.08, 0.18, cell.edge);
      const conductor = clamp01(Math.max(busbarX * cell.inside, fingers * cell.inside * 0.62, frame * 0.82) * 1.6);
      const chip = smoothstep(0.78 - wear * 0.18, 0.94 - wear * 0.08, fine) * cell.inside;
      const activeCell = cell.inside * (1 - chip);
      return {
        height: clamp01(0.34 + activeCell * 0.08 + conductor * 0.1 - chip * 0.06 + (fine - 0.5) * 0.028),
        accent: conductor,
        variation: hash2(cell.column, cell.row, definition.seed) * 0.55 + low * 0.45,
        roughness: clamp(definition.roughness + chip * 0.34 + fine * 0.04, 0.04, 1),
        metallic: clamp01(0.08 + activeCell * 0.12 + conductor * 0.88),
        ao: 1 - (1 - cell.inside) * 0.32 - chip * 0.08,
        emission: [activeCell * 0.005, activeCell * 0.012, activeCell * 0.018],
      };
    }
    case "anodizedAluminum": {
      const brush = Math.pow(0.5 + Math.sin((v * scale * detail * 18 + low * 0.8) * TAU) * 0.5, 5);
      const pores = smoothstep(0.72, 0.94, fine) * wear;
      return {
        height: clamp01(0.46 + (brush - 0.5) * 0.055 - pores * 0.035),
        accent: clamp01(brush * 0.42 + low * 0.28),
        variation: low * 0.58 + fine * 0.42,
        roughness: clamp(definition.roughness + (1 - brush) * 0.12 + pores * 0.26, 0.04, 1),
        metallic: 1,
        ao: 1 - pores * 0.12,
      };
    }
    case "diamondPlate": {
      const columns = Math.max(3, Math.round(scale));
      const row = Math.floor(v * columns * 1.35);
      const shifted = u * columns + (row % 2) * 0.5;
      const column = Math.floor(shifted);
      const localX = fract(shifted) - 0.5;
      const localY = fract(v * columns * 1.35) - 0.5;
      const sign = (column + row) % 2 === 0 ? 1 : -1;
      const cosine = Math.SQRT1_2;
      const rotatedX = (localX * cosine - localY * cosine * sign);
      const rotatedY = (localX * cosine * sign + localY * cosine);
      const lozengeDistance = Math.abs(rotatedX) / 0.34 + Math.abs(rotatedY) / 0.1;
      const ridge = smoothstep(1.15, 0.72, lozengeDistance);
      const grime = smoothstep(0.62, 0.86, low) * (1 - ridge) * wear;
      return {
        height: clamp01(0.3 + ridge * 0.58 + fine * 0.025),
        accent: grime,
        variation: low * 0.62 + fine * 0.38,
        roughness: clamp(definition.roughness + grime * 0.42 + fine * 0.06, 0.04, 1),
        metallic: clamp01(1 - grime * 0.72),
        ao: 0.72 + ridge * 0.28 - grime * 0.16,
      };
    }
    case "roadMarking": {
      const aggregate = smoothstep(0.5, 0.12, cells(u, v));
      const stripeDistance = Math.abs(fract(u * 2) - 0.5);
      const stripe = smoothstep(0.16, 0.11, stripeDistance);
      const chipped = smoothstep(0.64 - wear * 0.18, 0.88 - wear * 0.12, fine) * stripe;
      const paint = stripe * (1 - chipped);
      const crack = 1 - smoothstep(0.012, 0.09, edge);
      return {
        height: clamp01(0.2 + aggregate * 0.34 + paint * 0.16 - crack * 0.1),
        accent: paint,
        variation: low * 0.55 + aggregate * 0.45,
        roughness: clamp(definition.roughness - paint * 0.24 + chipped * 0.2 + fine * 0.06, 0.04, 1),
        metallic: 0,
        ao: 1 - crack * 0.42 - chipped * 0.08,
      };
    }
    case "efflorescentConcrete": {
      const pores = smoothstep(0.68, 0.92, fine);
      const crack = 1 - smoothstep(0.014, 0.08, edge);
      const streak = 1 - smoothstep(0.03, 0.13, Math.abs(Math.sin((u * scale * 0.72 + low * 0.34) * TAU)));
      const salt = clamp01(smoothstep(0.56 - wear * 0.16, 0.82 - wear * 0.08, low) * 0.7 + streak * wear * 0.62);
      return {
        height: clamp01(0.45 + (low - 0.5) * 0.18 - pores * 0.06 - crack * 0.13 + salt * 0.05),
        accent: salt,
        variation: low * 0.65 + fine * 0.35,
        roughness: clamp(definition.roughness + salt * 0.08 + pores * 0.08, 0.04, 1),
        metallic: 0,
        ao: 1 - crack * 0.46 - pores * 0.08,
      };
    }
    case "plywoodEdge": {
      const layers = Math.max(5, Math.round(scale * 1.7));
      const localLayer = fract(v * layers);
      const glue = 1 - smoothstep(0.025, 0.07, Math.min(localLayer, 1 - localLayer));
      const layerIndex = Math.floor(v * layers);
      const direction = layerIndex % 2 === 0 ? 1 : -1;
      const grain = 0.5 + Math.sin((u * scale * 2.4 * direction + low * 0.7) * TAU) * 0.5;
      const knot = smoothstep(0.42, 0.08, cells(u * 0.7 + layerIndex * 0.013, v));
      const chipped = smoothstep(0.78 - wear * 0.2, 0.94 - wear * 0.08, fine) * (1 - glue);
      return {
        height: clamp01(0.4 + grain * 0.12 - glue * 0.12 - chipped * 0.08 + knot * 0.05),
        accent: clamp01(glue * 0.88 + knot * 0.34),
        variation: grain * 0.62 + low * 0.38,
        roughness: clamp(definition.roughness + glue * 0.16 + chipped * 0.18, 0.04, 1),
        metallic: 0,
        ao: 1 - glue * 0.24 - chipped * 0.12,
      };
    }
    case "terrazzo": {
      const stone = smoothstep(0.44, 0.15, cells(u, v));
      const selected = smoothstep(0.38, 0.62, cellValues(u, v));
      const chip = stone * selected;
      const hairline = (1 - smoothstep(0.01, 0.065, edge)) * wear;
      return {
        height: clamp01(0.46 + chip * 0.07 - hairline * 0.06 + fine * 0.018),
        accent: chip,
        variation: cellValues(u, v) * 0.72 + low * 0.28,
        roughness: clamp(definition.roughness + (1 - chip) * 0.08 + hairline * 0.22, 0.04, 1),
        metallic: 0,
        ao: 1 - hairline * 0.22,
      };
    }
    case "chainmail": {
      const columns = Math.max(5, Math.round(scale * 1.35));
      const row = Math.floor(v * columns);
      const shifted = u * columns + (row % 2) * 0.5;
      const column = Math.floor(shifted);
      const localX = fract(shifted) - 0.5;
      const localY = fract(v * columns) - 0.5;
      const radius = Math.hypot(localX * 0.84, localY);
      const ring = 1 - smoothstep(0.045, 0.105, Math.abs(radius - 0.31));
      const crossing = smoothstep(-0.06, 0.08, localY * ((column + row) % 2 === 0 ? 1 : -1));
      const link = ring * (0.7 + crossing * 0.3);
      const tarnish = smoothstep(0.66, 0.88, low) * wear;
      return {
        height: clamp01(0.12 + link * (0.62 + crossing * 0.18) + fine * 0.025),
        accent: tarnish,
        variation: low * 0.58 + crossing * 0.42,
        roughness: clamp(definition.roughness + tarnish * 0.4 + fine * 0.05, 0.04, 1),
        metallic: clamp01(link * (1 - tarnish * 0.58)),
        ao: clamp01(0.34 + link * 0.66 - tarnish * 0.08),
      };
    }
  }
}

export function buildProductionStudyMaterial(
  definition: ProductionStudyDefinition,
  params: ProductionStudyParams = {},
): MaterialFields {
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const wear = params.wear ?? definition.wear;
  const color = params.color ?? definition.color;
  const accentColor = params.accentColor ?? definition.accentColor;
  const roughness = params.roughness ?? definition.roughness;
  const runtimeDefinition = { ...definition, roughness };
  const context: PatternContext = {
    definition: runtimeDefinition,
    noise: makeNoise(seed),
    detailNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(3, scale * 1.4), seed: seed + 13, metric: "f1" }),
    cellValues: voronoi({ scale: Math.max(3, scale * 1.4), seed: seed + 13, metric: "cellValue" }),
    edges: voronoi({ scale: Math.max(2, scale * 0.9), seed: seed + 29, metric: "f2-f1" }),
    scale,
    detail,
    wear,
  };
  const sample = (u: number, v: number) => samplePattern(context, u, v);

  return {
    baseColor: (u, v) => {
      const result = sample(u, v);
      const mixed = blendColor(color, accentColor, clamp01(result.accent));
      return shade(mixed, 0.78 + result.variation * 0.3);
    },
    metallic: (u, v) => clamp01(sample(u, v).metallic ?? definition.metallic),
    roughness: (u, v) => clamp(sample(u, v).roughness, 0.04, 1),
    ao: (u, v) => clamp01(sample(u, v).ao),
    height: (u, v) => clamp01(sample(u, v).height),
    emission: (u, v) => sample(u, v).emission ?? [0, 0, 0],
    normalStrength: definition.normalStrength,
    tileable: true,
  };
}

export const PRODUCTION_STUDY_DEFINITIONS = {
  photovoltaicSolarPanel: { label: "光伏电池板", focus: "电池栅格、汇流条、细栅线与边缘缺损", kind: "solarPanel", seed: 1001, scale: 6, detail: 4, wear: 0.16, color: [0.018, 0.075, 0.16], accentColor: [0.62, 0.7, 0.76], roughness: 0.14, metallic: 0.22, normalStrength: 3 },
  anodizedBrushedAluminum: { label: "阳极氧化拉丝铝", focus: "定向拉丝、氧化膜染色与微孔磨损", kind: "anodizedAluminum", seed: 1002, scale: 8, detail: 6, wear: 0.22, color: [0.12, 0.28, 0.42], accentColor: [0.42, 0.66, 0.78], roughness: 0.24, metallic: 1, normalStrength: 2 },
  raisedDiamondTreadPlate: { label: "菱形防滑钢板", focus: "交错凸棱、谷底积污与金属磨亮", kind: "diamondPlate", seed: 1003, scale: 7, detail: 4, wear: 0.38, color: [0.38, 0.41, 0.43], accentColor: [0.16, 0.12, 0.075], roughness: 0.32, metallic: 1, normalStrength: 7 },
  chippedRoadMarkingAsphalt: { label: "剥落道路标线", focus: "沥青骨料、道路裂缝与标线剥落", kind: "roadMarking", seed: 1004, scale: 9, detail: 5, wear: 0.54, color: [0.055, 0.06, 0.065], accentColor: [0.86, 0.74, 0.16], roughness: 0.88, metallic: 0, normalStrength: 6 },
  saltWeatheredConcrete: { label: "泛碱风化混凝土", focus: "毛细迁移、盐析白华、竖向渗流与孔洞", kind: "efflorescentConcrete", seed: 1005, scale: 6, detail: 6, wear: 0.58, color: [0.42, 0.43, 0.41], accentColor: [0.82, 0.81, 0.72], roughness: 0.9, metallic: 0, normalStrength: 5 },
  exposedPlywoodEdge: { label: "外露层压板边", focus: "交错单板、胶层、木纹方向与崩边", kind: "plywoodEdge", seed: 1006, scale: 8, detail: 5, wear: 0.34, color: [0.57, 0.34, 0.13], accentColor: [0.18, 0.085, 0.025], roughness: 0.66, metallic: 0, normalStrength: 4 },
  polishedTerrazzoFloor: { label: "抛光水磨石地面", focus: "多尺寸骨料、磨平高度与发丝裂纹", kind: "terrazzo", seed: 1007, scale: 12, detail: 4, wear: 0.18, color: [0.62, 0.59, 0.54], accentColor: [0.18, 0.28, 0.33], roughness: 0.26, metallic: 0, normalStrength: 2 },
  interlockedChainmail: { label: "交错锁子甲", focus: "错列金属环、上下穿插与氧化积污", kind: "chainmail", seed: 1008, scale: 10, detail: 4, wear: 0.32, color: [0.34, 0.37, 0.39], accentColor: [0.16, 0.09, 0.045], roughness: 0.3, metallic: 0.92, normalStrength: 8 },
} as const satisfies Record<string, ProductionStudyDefinition>;

export type ProductionStudyName = keyof typeof PRODUCTION_STUDY_DEFINITIONS;

function recipe(name: ProductionStudyName) {
  return (params: ProductionStudyParams = {}) => buildProductionStudyMaterial(PRODUCTION_STUDY_DEFINITIONS[name], params);
}

export const PRODUCTION_STUDY_MATERIALS = Object.fromEntries(
  (Object.keys(PRODUCTION_STUDY_DEFINITIONS) as ProductionStudyName[]).map((name) => [name, recipe(name)]),
) as Record<ProductionStudyName, (params?: ProductionStudyParams) => MaterialFields>;

export const PRODUCTION_STUDY_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(PRODUCTION_STUDY_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 9999, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 2, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "wear", label: "磨损程度", type: "range", min: 0, max: 1, step: 0.02, default: definition.wear },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies ProductionStudyParamSpec[]]),
) as Record<ProductionStudyName, ProductionStudyParamSpec[]>;

export function defaultProductionStudyParams(name: ProductionStudyName): ProductionStudyParams {
  const params: ProductionStudyParams = {};
  for (const spec of PRODUCTION_STUDY_PARAM_SCHEMA[name]) {
    const value = Array.isArray(spec.default) ? [...spec.default] as RGB : spec.default;
    Object.assign(params, { [spec.key]: value });
  }
  return params;
}
