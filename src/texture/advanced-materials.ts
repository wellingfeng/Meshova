import { fbm2, makeNoise, type Noise } from "../random/noise.js";
import { clamp, smoothstep } from "../math/scalar.js";
import { makeTexture, sample } from "./buffer.js";
import { blendColor, voronoi } from "./patterns.js";
import { materialFromFields, type Material, type MaterialFields } from "./pbr.js";
import { buildLayeredWearMasks } from "./wear.js";

type RGB = [number, number, number];

type AdvancedMaterialKind =
  | "paintedMetal"
  | "forestGround"
  | "treeRings"
  | "wovenFabric"
  | "layeredCliff"
  | "brickWall"
  | "roofTiles"
  | "leather"
  | "ornament";

export interface AdvancedMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  wear?: number;
  color?: RGB;
  accentColor?: RGB;
  roughness?: number;
}

export interface AdvancedMaterialParamSpec {
  key: keyof AdvancedMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface AdvancedMaterialDefinition {
  label: string;
  focus: string;
  kind: AdvancedMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
  normalStrength: number;
}

interface SampleContext {
  definition: AdvancedMaterialDefinition;
  noise: Noise;
  detailNoise: Noise;
  cells: ReturnType<typeof voronoi>;
  cracks: ReturnType<typeof voronoi>;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  color: RGB;
  accentColor: RGB;
  roughness: number;
}

interface AdvancedSample {
  height: number;
  mask: number;
  variation: number;
  roughness?: number;
  metallic?: number;
  ao?: number;
}

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);
const clamp01 = (value: number) => clamp(value, 0, 1);

function hash2(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return fract(value);
}

function shade(color: RGB, value: number): RGB {
  return [
    clamp01(color[0] * value),
    clamp01(color[1] * value),
    clamp01(color[2] * value),
  ];
}

function gridCell(u: number, v: number, columns: number, rows: number, stagger = 0) {
  const row = Math.floor(v * rows);
  const x = u * columns + (row % 2) * stagger;
  const column = Math.floor(x);
  return {
    column,
    row,
    localU: fract(x),
    localV: fract(v * rows),
  };
}

function sampleAdvanced(context: SampleContext, u: number, v: number): AdvancedSample {
  const { definition, noise, detailNoise, cells, cracks, seed, scale, detail, wear } = context;
  const fine = fbm2(detailNoise, u * scale * detail, v * scale * detail, { octaves: 4 }) * 0.5 + 0.5;
  const broad = fbm2(noise, u * scale * 0.42, v * scale * 0.42, { octaves: 5 }) * 0.5 + 0.5;

  switch (definition.kind) {
    case "paintedMetal": {
      const panel = gridCell(u, v, Math.max(2, Math.round(scale * 0.55)), Math.max(2, Math.round(scale * 0.4)));
      const seam = Math.min(panel.localU, 1 - panel.localU, panel.localV, 1 - panel.localV);
      const seamMask = 1 - smoothstep(0.018, 0.07, seam);
      const hammered = fbm2(detailNoise, u * scale * detail * 1.8, v * scale * detail * 1.8, { octaves: 3 }) * 0.5 + 0.5;
      return {
        height: clamp01(0.52 + hammered * 0.055 - seamMask * 0.24),
        mask: seamMask,
        variation: broad * 0.55 + fine * 0.45,
        roughness: context.roughness + fine * 0.08,
        metallic: 0,
        ao: 1 - seamMask * 0.32,
      };
    }
    case "forestGround": {
      const rock = smoothstep(0.46, 0.08, cells(u, v));
      const leafCell = gridCell(u, v, Math.round(scale * 1.4), Math.round(scale * 1.4), 0.5);
      const angle = hash2(leafCell.column, leafCell.row, seed) * TAU;
      const localX = leafCell.localU - 0.5;
      const localY = leafCell.localV - 0.5;
      const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
      const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);
      const leafDistance = Math.hypot(rotatedX / 0.42, rotatedY / 0.13);
      const leaf = smoothstep(1.08, 0.82, leafDistance) * smoothstep(0.28, 0.72, hash2(leafCell.column + 8, leafCell.row, seed));
      const twig = smoothstep(0.035, 0.008, Math.abs(rotatedY)) * smoothstep(0.44, 0.18, Math.abs(rotatedX));
      const height = 0.18 + broad * 0.28 + rock * 0.38 + leaf * 0.17 + twig * 0.1;
      return { height: clamp01(height), mask: clamp01(rock * 0.7 + leaf), variation: broad * 0.5 + fine * 0.5, roughness: 0.84 + fine * 0.12, ao: 0.72 + height * 0.28 };
    }
    case "treeRings": {
      const x = u - 0.5;
      const y = v - 0.5;
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      const warp = fbm2(noise, u * 3.2, v * 3.2, { octaves: 5 }) * 0.055;
      const ring = Math.pow(0.5 + Math.sin((radius + warp) * scale * 5.5 * TAU) * 0.5, 2.2);
      const radialCrack = smoothstep(0.985, 0.998, 0.5 + Math.sin(angle * Math.max(5, Math.round(scale)) + broad * 5) * 0.5) * smoothstep(0.12, 0.48, radius);
      const fiber = 0.5 + Math.sin((radius * scale * detail * 30 + fine * 2) * TAU) * 0.5;
      return { height: clamp01(0.36 + ring * 0.28 + fiber * 0.045 - radialCrack * wear * 0.42), mask: ring, variation: ring * 0.7 + fine * 0.3, roughness: context.roughness + radialCrack * 0.18, ao: 1 - radialCrack * 0.42 };
    }
    case "wovenFabric": {
      const count = Math.max(4, Math.round(scale * 2));
      const x = u * count;
      const y = v * count;
      const column = Math.floor(x);
      const row = Math.floor(y);
      const warpThread = Math.pow(Math.max(0, Math.cos((fract(x) - 0.5) * Math.PI)), 5);
      const weftThread = Math.pow(Math.max(0, Math.cos((fract(y) - 0.5) * Math.PI)), 5);
      const over = (column + row * 2) % 4 < 2;
      const thread = over ? Math.max(warpThread, weftThread * 0.72) : Math.max(weftThread, warpThread * 0.72);
      const fuzz = fbm2(detailNoise, u * scale * detail * 5, v * scale * detail * 5, { octaves: 3 }) * 0.5 + 0.5;
      return { height: clamp01(0.24 + thread * 0.58 + fuzz * 0.06), mask: over ? warpThread : weftThread, variation: thread * 0.65 + fuzz * 0.35, roughness: 0.86 + fuzz * 0.12, ao: 0.68 + thread * 0.32 };
    }
    case "layeredCliff": {
      const warp = fbm2(noise, u * scale * 0.45, v * scale * 0.28, { octaves: 5 }) * 0.24;
      const strata = 0.5 + Math.sin((v * scale * 2.4 + warp + broad * 0.16) * TAU) * 0.5;
      const ledge = Math.pow(strata, 3.2);
      const fracture = 1 - smoothstep(0.02, 0.11, cracks(u + warp * 0.05, v));
      const erosion = fbm2(detailNoise, u * scale * detail * 0.8, v * scale * detail * 0.25, { octaves: 5 }) * 0.5 + 0.5;
      return { height: clamp01(0.14 + ledge * 0.58 + erosion * 0.16 - fracture * wear * 0.26), mask: ledge, variation: strata * 0.62 + erosion * 0.38, roughness: 0.82 + fine * 0.14, ao: 0.7 + ledge * 0.3 - fracture * 0.18 };
    }
    case "brickWall": {
      const columns = Math.max(3, Math.round(scale));
      const cell = gridCell(u, v, columns, Math.max(3, Math.round(columns * 1.7)), 0.5);
      const edge = Math.min(cell.localU, 1 - cell.localU, cell.localV, 1 - cell.localV);
      const mortar = 1 - smoothstep(0.025, 0.085, edge);
      const chip = smoothstep(0.78, 0.96, hash2(cell.column, cell.row, seed) * 0.55 + fine * 0.45) * wear;
      const brickValue = hash2(cell.column, cell.row, seed + 17);
      return { height: clamp01(0.18 + (1 - mortar) * (0.58 + brickValue * 0.12) - chip * 0.16), mask: mortar, variation: brickValue * 0.65 + fine * 0.35, roughness: context.roughness + mortar * 0.08, ao: 1 - mortar * 0.42 };
    }
    case "roofTiles": {
      const columns = Math.max(3, Math.round(scale));
      const rows = Math.max(3, Math.round(scale * 1.35));
      const cell = gridCell(u, v, columns, rows, 0.5);
      const arch = Math.sqrt(Math.max(0, 1 - Math.pow((cell.localU - 0.5) * 2, 2)));
      const overlap = smoothstep(0.02, 0.18, cell.localV);
      const gap = 1 - smoothstep(0.025, 0.075, Math.min(cell.localU, 1 - cell.localU));
      const tileValue = hash2(cell.column, cell.row, seed);
      return { height: clamp01(0.12 + arch * overlap * 0.68 - gap * 0.18 + fine * 0.035), mask: gap, variation: tileValue * 0.7 + fine * 0.3, roughness: context.roughness + gap * 0.12, ao: 0.72 + arch * 0.28 - gap * 0.22 };
    }
    case "leather": {
      const wrinkles = fbm2(noise, u * scale * 0.7 + broad * 0.12, v * scale * 2.8, { octaves: 5 }) * 0.5 + 0.5;
      const pores = smoothstep(0.32, 0.08, cells(u * detail, v * detail));
      const scratch = smoothstep(0.985, 0.999, 0.5 + Math.sin((u * scale * 7 + broad) * TAU) * 0.5) * smoothstep(0.58, 0.86, fine) * wear;
      return { height: clamp01(0.34 + wrinkles * 0.24 + pores * 0.1 - scratch * 0.24), mask: pores, variation: wrinkles * 0.62 + fine * 0.38, roughness: context.roughness + pores * 0.12 - scratch * 0.1, ao: 0.84 + wrinkles * 0.16 - scratch * 0.18 };
    }
    case "ornament": {
      const x = u - 0.5;
      const y = v - 0.5;
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      const symmetry = Math.max(4, Math.round(scale));
      const petals = Math.abs(Math.cos(angle * symmetry * 0.5));
      const petalRadius = 0.18 + petals * 0.2;
      const rosette = smoothstep(0.035, 0.0, Math.abs(radius - petalRadius));
      const center = smoothstep(0.13, 0.08, radius);
      const borderDistance = Math.min(u, 1 - u, v, 1 - v);
      const border = smoothstep(0.035, 0.012, Math.abs(borderDistance - 0.08));
      const bead = smoothstep(0.72, 0.94, 0.5 + Math.cos((angle * symmetry + radius * detail * 12) * TAU) * 0.5) * smoothstep(0.44, 0.31, radius);
      const relief = Math.max(rosette, center * 0.82, border * 0.86, bead * 0.58);
      return { height: clamp01(0.2 + relief * 0.66 + fine * 0.035), mask: relief, variation: relief * 0.78 + fine * 0.22, roughness: context.roughness - relief * 0.08, ao: 0.76 + relief * 0.24 };
    }
  }
}

function buildFields(context: SampleContext): MaterialFields {
  const evaluate = (u: number, v: number) => sampleAdvanced(context, u, v);
  return {
    baseColor: (u, v) => {
      const result = evaluate(u, v);
      const mixed = blendColor(context.color, context.accentColor, clamp01(result.mask));
      return shade(mixed, 0.78 + result.variation * 0.34 - context.wear * result.mask * 0.08);
    },
    metallic: (u, v) => clamp01(evaluate(u, v).metallic ?? 0),
    roughness: (u, v) => clamp(evaluate(u, v).roughness ?? context.roughness, 0.04, 1),
    ao: (u, v) => clamp01(evaluate(u, v).ao ?? 1),
    height: (u, v) => clamp01(evaluate(u, v).height),
    normalStrength: context.definition.normalStrength,
  };
}

function applyPaintWear(material: Material, context: SampleContext): Material {
  const masks = buildLayeredWearMasks(material.height, {
    seed: context.seed,
    edgeAmount: context.wear,
    cavityAmount: context.wear,
    chipAmount: context.wear,
    scratchAmount: context.wear * 0.75,
    breakupScale: context.scale,
    scratchScale: context.scale * context.detail * 2.5,
  });
  const baseColor = makeTexture(material.baseColor.width, material.baseColor.height, 3);
  const metallic = makeTexture(material.metallic.width, material.metallic.height, 1);
  const roughness = makeTexture(material.roughness.width, material.roughness.height, 1);
  const metalColor: RGB = [0.42, 0.45, 0.47];
  const rustColor: RGB = [0.32, 0.075, 0.018];

  for (let y = 0; y < material.height.height; y++) {
    for (let x = 0; x < material.height.width; x++) {
      const pixel = y * material.height.width + x;
      const colorPixel = pixel * 3;
      const chip = clamp01(sample(masks.chippedPaint, x, y) + sample(masks.scratches, x, y));
      const rust = clamp01(sample(masks.cavityDirt, x, y) * context.wear * 1.45);
      const exposed = chip * (1 - rust);
      const paint: RGB = [
        material.baseColor.data[colorPixel]!,
        material.baseColor.data[colorPixel + 1]!,
        material.baseColor.data[colorPixel + 2]!,
      ];
      const exposedColor = blendColor(metalColor, rustColor, rust);
      const color = blendColor(paint, exposedColor, chip);
      baseColor.data[colorPixel] = color[0];
      baseColor.data[colorPixel + 1] = color[1];
      baseColor.data[colorPixel + 2] = color[2];
      metallic.data[pixel] = exposed;
      roughness.data[pixel] = clamp(0.38 + rust * 0.5 + (1 - chip) * context.roughness * 0.35, 0.04, 1);
    }
  }

  return { ...material, baseColor, metallic, roughness };
}

export function buildAdvancedMaterial(
  definition: AdvancedMaterialDefinition,
  size: number,
  params: AdvancedMaterialParams = {},
): Material {
  const seed = params.seed ?? definition.seed;
  const context: SampleContext = {
    definition,
    noise: makeNoise(seed),
    detailNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(3, (params.scale ?? definition.scale) * 1.1), seed: seed + 13, metric: "f1" }),
    cracks: voronoi({ scale: Math.max(2, (params.scale ?? definition.scale) * 0.8), seed: seed + 29, metric: "f2-f1" }),
    seed,
    scale: params.scale ?? definition.scale,
    detail: params.detail ?? definition.detail,
    wear: params.wear ?? definition.wear,
    color: params.color ?? definition.color,
    accentColor: params.accentColor ?? definition.accentColor,
    roughness: params.roughness ?? definition.roughness,
  };
  const material = materialFromFields(size, buildFields(context));
  return definition.kind === "paintedMetal" ? applyPaintWear(material, context) : material;
}

export const ADVANCED_MATERIAL_DEFINITIONS = {
  damagedPaintedMetal: { label: "破损喷漆金属", focus: "分层遮罩、边缘磨损、锈蚀传播", kind: "paintedMetal", seed: 201, scale: 7, detail: 4, wear: 0.62, color: [0.08, 0.24, 0.38], accentColor: [0.03, 0.08, 0.11], roughness: 0.48, normalStrength: 4 },
  forestGround: { label: "森林地表", focus: "泥土、石块、枝叶多尺度混合", kind: "forestGround", seed: 202, scale: 8, detail: 4, wear: 0.35, color: [0.11, 0.075, 0.035], accentColor: [0.23, 0.31, 0.08], roughness: 0.92, normalStrength: 5 },
  treeBarkRings: { label: "树皮与年轮", focus: "方向场、纤维、径向裂缝", kind: "treeRings", seed: 203, scale: 6, detail: 5, wear: 0.46, color: [0.23, 0.09, 0.025], accentColor: [0.66, 0.38, 0.12], roughness: 0.76, normalStrength: 5 },
  wovenFabric: { label: "高级编织物", focus: "经纬结构、斜纹交错、绒毛", kind: "wovenFabric", seed: 204, scale: 9, detail: 4, wear: 0.18, color: [0.055, 0.12, 0.19], accentColor: [0.42, 0.64, 0.72], roughness: 0.94, normalStrength: 6 },
  layeredCliff: { label: "岩层悬崖", focus: "定向噪声、侵蚀、层理", kind: "layeredCliff", seed: 205, scale: 7, detail: 5, wear: 0.58, color: [0.19, 0.15, 0.11], accentColor: [0.52, 0.38, 0.22], roughness: 0.91, normalStrength: 7 },
  floodFillBrickWall: { label: "随机砖墙", focus: "单元随机、倒角、砂浆与破损", kind: "brickWall", seed: 206, scale: 7, detail: 4, wear: 0.42, color: [0.5, 0.12, 0.045], accentColor: [0.18, 0.14, 0.1], roughness: 0.88, normalStrength: 6 },
  layeredRoofTiles: { label: "叠层屋瓦", focus: "单元属性、弧面轮廓、搭接阴影", kind: "roofTiles", seed: 207, scale: 8, detail: 4, wear: 0.38, color: [0.32, 0.07, 0.035], accentColor: [0.68, 0.22, 0.08], roughness: 0.82, normalStrength: 6 },
  agedLeather: { label: "做旧皮革", focus: "皱褶、毛孔、划痕与油脂磨损", kind: "leather", seed: 208, scale: 8, detail: 5, wear: 0.48, color: [0.12, 0.035, 0.015], accentColor: [0.48, 0.19, 0.055], roughness: 0.66, normalStrength: 4 },
  ornamentalPattern: { label: "程序化装饰花纹", focus: "SDF、对称、路径重复与浮雕", kind: "ornament", seed: 209, scale: 8, detail: 4, wear: 0.2, color: [0.055, 0.12, 0.13], accentColor: [0.72, 0.48, 0.12], roughness: 0.38, normalStrength: 5 },
} as const satisfies Record<string, AdvancedMaterialDefinition>;

export type AdvancedMaterialName = keyof typeof ADVANCED_MATERIAL_DEFINITIONS;

function recipe(name: AdvancedMaterialName) {
  return (size: number, params: AdvancedMaterialParams = {}) => (
    buildAdvancedMaterial(ADVANCED_MATERIAL_DEFINITIONS[name], size, params)
  );
}

export const ADVANCED_MATERIALS = {
  damagedPaintedMetal: recipe("damagedPaintedMetal"),
  forestGround: recipe("forestGround"),
  treeBarkRings: recipe("treeBarkRings"),
  wovenFabric: recipe("wovenFabric"),
  layeredCliff: recipe("layeredCliff"),
  floodFillBrickWall: recipe("floodFillBrickWall"),
  layeredRoofTiles: recipe("layeredRoofTiles"),
  agedLeather: recipe("agedLeather"),
  ornamentalPattern: recipe("ornamentalPattern"),
} as const;

export const ADVANCED_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(ADVANCED_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 2, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "wear", label: "磨损程度", type: "range", min: 0, max: 1, step: 0.02, default: definition.wear },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
    { key: "roughness", label: "基础粗糙度", type: "range", min: 0.04, max: 1, step: 0.01, default: definition.roughness },
  ] satisfies AdvancedMaterialParamSpec[]]),
) as Record<AdvancedMaterialName, AdvancedMaterialParamSpec[]>;

export function defaultAdvancedMaterialParams(name: AdvancedMaterialName): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const spec of ADVANCED_MATERIAL_PARAM_SCHEMA[name]) {
    params[spec.key] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  return params;
}
