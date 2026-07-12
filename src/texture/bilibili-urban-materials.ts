import { clamp } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { cableGenerator, crackGenerator, panelGenerator } from "./material-generators.js";
import { autoLevels, mapAll, scaleNormal, slopeBlur } from "./filters.js";
import { layerMaterials, semanticLayerMask } from "./material-layering.js";
import { voronoi } from "./patterns.js";
import { brick, brickHeight, brickValue } from "./patterns2.js";
import { heightToNormal, materialFromFields, type Material, type MaterialFields } from "./pbr.js";
import { sdfCircle } from "./sdf.js";

type RGB = [number, number, number];

type UrbanMaterialKind =
  | "urbanGroundKit"
  | "damagedPlasterBrick"
  | "sciFiIndustrialPanel"
  | "brushedMetalGrille"
  | "wetDrainConcrete";

export interface UrbanMaterialParams {
  seed?: number;
  scale?: number;
  detail?: number;
  wear?: number;
  wetness?: number;
  color?: RGB;
  accentColor?: RGB;
}

export interface UrbanMaterialParamSpec {
  key: keyof UrbanMaterialParams;
  label: string;
  type: "range" | "rgb";
  min?: number;
  max?: number;
  step?: number;
  default: number | RGB;
}

export interface UrbanMaterialDefinition {
  label: string;
  description: string;
  kind: UrbanMaterialKind;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  wetness: number;
  color: RGB;
  accentColor: RGB;
  normalStrength: number;
}

interface SurfaceSample {
  color: RGB;
  height: number;
  metallic: number;
  roughness: number;
  ao: number;
}

interface PatternContext {
  definition: UrbanMaterialDefinition;
  seed: number;
  scale: number;
  detail: number;
  wear: number;
  wetness: number;
  color: RGB;
  accentColor: RGB;
  broadNoise: ReturnType<typeof makeNoise>;
  fineNoise: ReturnType<typeof makeNoise>;
  cells: ReturnType<typeof voronoi>;
  bricks: {
    mask: ReturnType<typeof brick>;
    height: ReturnType<typeof brickHeight>;
    value: ReturnType<typeof brickValue>;
  };
  cracks: ReturnType<typeof crackGenerator>;
  panels: ReturnType<typeof panelGenerator>;
  cables: ReturnType<typeof cableGenerator>;
}

const TAU = Math.PI * 2;
const GRILLE_HOLE = sdfCircle(0.33);
const clamp01 = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);

function smoothstep(low: number, high: number, value: number): number {
  const amount = clamp01((value - low) / Math.max(1e-6, high - low));
  return amount * amount * (3 - 2 * amount);
}

function hash2(xCoord: number, yCoord: number, seed: number): number {
  return fract(Math.sin(xCoord * 127.1 + yCoord * 311.7 + seed * 73.19) * 43758.5453);
}

function mixColor(first: RGB, second: RGB, amount: number): RGB {
  const blend = clamp01(amount);
  return [
    first[0] + (second[0] - first[0]) * blend,
    first[1] + (second[1] - first[1]) * blend,
    first[2] + (second[2] - first[2]) * blend,
  ];
}

function shade(color: RGB, amount: number): RGB {
  return [clamp01(color[0] * amount), clamp01(color[1] * amount), clamp01(color[2] * amount)];
}

function gridCell(
  uCoord: number,
  vCoord: number,
  columns: number,
  rows: number,
  stagger = 0,
) {
  const row = Math.floor(vCoord * rows);
  const scaledX = uCoord * columns + (row % 2) * stagger;
  const localX = fract(scaledX);
  const localY = fract(vCoord * rows);
  const edge = Math.min(localX, 1 - localX, localY, 1 - localY);
  return { localX, localY, edge, column: Math.floor(scaledX), row };
}

function baseNoise(context: PatternContext, uCoord: number, vCoord: number) {
  const broad = fbm2(context.broadNoise, uCoord * context.scale, vCoord * context.scale, { octaves: 4 }) * 0.5 + 0.5;
  const fine = fbm2(
    context.fineNoise,
    uCoord * context.scale * context.detail * 3,
    vCoord * context.scale * context.detail * 3,
    { octaves: 3 },
  ) * 0.5 + 0.5;
  return { broad, fine };
}

function sampleUrbanGround(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  const { broad, fine } = baseNoise(context, uCoord, vCoord);
  const columns = Math.max(4, Math.round(context.scale));

  if (vCoord < 0.18) {
    const localV = vCoord / 0.18;
    const channel = Math.sin(localV * Math.PI);
    const barDistance = Math.min(fract(uCoord * columns * 1.5), 1 - fract(uCoord * columns * 1.5));
    const grate = 1 - smoothstep(0.08, 0.18, barDistance);
    const rim = 1 - smoothstep(0.04, 0.14, Math.min(localV, 1 - localV));
    const metal = Math.max(grate, rim);
    const grime = clamp01((1 - channel) * 0.2 + broad * 0.35);
    return {
      color: shade(mixColor([0.055, 0.06, 0.062], context.accentColor, metal * 0.35), 0.72 + fine * 0.2 - grime * 0.2),
      height: clamp01(0.08 + metal * 0.34 + rim * 0.16 - channel * 0.12 + fine * 0.025),
      metallic: metal * 0.9,
      roughness: clamp01(0.42 + grime * 0.35 - context.wetness * channel * 0.2),
      ao: clamp01(0.42 + metal * 0.4),
    };
  }

  if (vCoord < 0.33) {
    const localV = (vCoord - 0.18) / 0.15;
    const segment = gridCell(uCoord, 0.5, columns, 1);
    const seam = 1 - smoothstep(0.025, 0.07, segment.edge);
    const bevel = smoothstep(0, 0.16, localV) * (1 - smoothstep(0.84, 1, localV));
    const chip = seam * smoothstep(0.64, 0.86, fine) * context.wear;
    return {
      color: shade(context.color, 0.78 + broad * 0.22 - chip * 0.28),
      height: clamp01(0.58 + bevel * 0.24 - seam * 0.22 - chip * 0.18 + fine * 0.035),
      metallic: 0,
      roughness: clamp01(0.72 + fine * 0.16),
      ao: clamp01(1 - seam * 0.48 - chip * 0.3),
    };
  }

  if (vCoord < 0.62) {
    const localV = (vCoord - 0.33) / 0.29;
    const tile = gridCell(uCoord, localV, columns, Math.max(2, Math.round(columns * 0.55)), 0.5);
    const mortar = 1 - smoothstep(0.035, 0.09, tile.edge);
    const tileVariation = hash2(tile.column, tile.row, context.seed);
    const chip = mortar * smoothstep(0.7, 0.9, fine) * context.wear;
    return {
      color: shade(mixColor(context.color, context.accentColor, tileVariation * 0.25), 0.8 + broad * 0.18 - mortar * 0.22),
      height: clamp01(0.43 + (1 - mortar) * 0.2 - chip * 0.16 + fine * 0.035),
      metallic: 0,
      roughness: clamp01(0.72 + mortar * 0.18 + fine * 0.08),
      ao: clamp01(1 - mortar * 0.48),
    };
  }

  const cobbleDistance = context.cells(uCoord, (vCoord - 0.62) / 0.38);
  const cobble = 1 - smoothstep(0.26, 0.48, cobbleDistance);
  const mortar = 1 - cobble;
  const crack = context.cracks(uCoord, vCoord).crack;
  return {
    color: shade(mixColor(context.accentColor, context.color, broad * 0.55), 0.72 + cobble * 0.28 - crack * 0.25),
    height: clamp01(0.25 + cobble * (0.34 + broad * 0.12) - crack * context.wear * 0.18 + fine * 0.035),
    metallic: 0,
    roughness: clamp01(0.76 + mortar * 0.16 + fine * 0.06),
    ao: clamp01(1 - mortar * 0.52 - crack * 0.28),
  };
}

function sampleDamagedWall(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  const { broad, fine } = baseNoise(context, uCoord, vCoord);
  const brickMask = context.bricks.mask(uCoord, vCoord);
  const brickRelief = context.bricks.height(uCoord, vCoord);
  const mortar = 1 - smoothstep(0.02, 0.22, brickRelief);
  const crackSample = context.cracks(uCoord, vCoord);
  const crack = crackSample.crack;
  const damageField = broad * 0.72 + fine * 0.18 + crack * context.wear * 0.55;
  const exposed = smoothstep(0.58 - context.wear * 0.28, 0.72, damageField);
  const chippedEdge = exposed * Math.max(
    smoothstep(0.62, 0.86, fine) * (1 - brickRelief),
    crackSample.edgeDamage * context.wear,
  );
  const brickVariation = context.bricks.value(uCoord, vCoord);
  const plasterColor = shade(context.color, 0.82 + broad * 0.18 - crack * 0.2);
  const brickColor = shade(context.accentColor, 0.68 + brickVariation * 0.32 - mortar * 0.35);
  return {
    color: shade(mixColor(plasterColor, brickColor, exposed * brickMask), 1 - crack * 0.62),
    height: clamp01(0.4 + (1 - exposed) * 0.25 + exposed * brickRelief * 0.12 - chippedEdge * 0.18 - crack * 0.12),
    metallic: 0,
    roughness: clamp01(0.76 + exposed * 0.12 + mortar * 0.08 + fine * 0.04),
    ao: clamp01(1 - exposed * mortar * 0.48 - crack * 0.34 - chippedEdge * 0.18),
  };
}

function sampleSciFiPanel(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  const { broad, fine } = baseNoise(context, uCoord, vCoord);
  const grid = gridCell(uCoord, vCoord, Math.max(3, Math.round(context.scale * 0.55)), Math.max(3, Math.round(context.scale * 0.55)));
  const panel = context.panels(uCoord, vCoord);
  const cableSample = context.cables(uCoord, vCoord);
  const seam = Math.max(panel.seam, panel.cutline);
  const inset = panel.inset;
  const bolt = panel.bolts;
  const vent = panel.vents;
  const cable = cableSample.cable;
  const hazard = grid.row % 4 === 2 && grid.column % 3 === 1
    ? smoothstep(0.43, 0.49, Math.sin((uCoord + vCoord) * context.scale * TAU) * 0.5 + 0.5)
    : 0;
  const scratch = smoothstep(0.92, 0.985, fine) * context.wear;
  const feature = Math.max(bolt, cable, hazard);
  const panelColor = shade(context.color, 0.72 + broad * 0.22 - scratch * 0.28);
  const featureColor = mixColor(context.accentColor, [0.8, 0.42, 0.06], hazard * 0.8);
  return {
    color: mixColor(panelColor, featureColor, feature),
    height: clamp01(0.45 + inset * 0.09 + bolt * 0.2 + cableSample.height * 0.14 - seam * 0.22 - vent * 0.28 - scratch * 0.04),
    metallic: clamp01(0.82 + bolt * 0.18 - hazard * 0.62),
    roughness: clamp01(0.28 + seam * 0.22 + scratch * 0.35 + hazard * 0.18),
    ao: clamp01(1 - seam * 0.48 - vent * 0.58 - cableSample.shadow * 0.22),
  };
}

function sampleMetalGrille(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  const { broad, fine } = baseNoise(context, uCoord, vCoord);
  const count = Math.max(5, Math.round(context.scale));
  const grid = gridCell(uCoord, vCoord, count, count);
  const holeDistance = GRILLE_HOLE(grid.localX - 0.5, grid.localY - 0.5);
  const hole = 1 - smoothstep(-0.035, 0.035, holeDistance);
  const rim = 1 - smoothstep(0.015, 0.085, Math.abs(holeDistance));
  const frame = 1 - smoothstep(0.025, 0.07, Math.min(uCoord, 1 - uCoord, vCoord, 1 - vCoord));
  const brush = Math.sin((vCoord * context.detail * 120 + broad * 3) * TAU) * 0.5 + 0.5;
  const scratch = smoothstep(0.94, 0.99, fine) * context.wear;
  const metalColor = shade(context.color, 0.72 + brush * 0.2 + rim * 0.14 - scratch * 0.24);
  const voidColor = shade(context.accentColor, 0.24 + broad * 0.12);
  return {
    color: mixColor(metalColor, voidColor, hole),
    height: clamp01(0.52 + rim * 0.16 + frame * 0.18 - hole * 0.48 + brush * 0.018 - scratch * 0.025),
    metallic: clamp01(1 - hole * 0.65),
    roughness: clamp01(0.19 + brush * 0.16 + scratch * 0.38 + hole * 0.46),
    ao: clamp01(1 - hole * 0.78 + rim * 0.12),
  };
}

function sampleWetDrain(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  const { broad, fine } = baseNoise(context, uCoord, vCoord);
  const channelDistance = Math.abs(uCoord - 0.5);
  const channel = 1 - smoothstep(0.12, 0.3, channelDistance);
  const channelRim = smoothstep(0.12, 0.18, channelDistance) * (1 - smoothstep(0.27, 0.31, channelDistance));
  const barDistance = Math.min(fract(vCoord * context.scale * 1.8), 1 - fract(vCoord * context.scale * 1.8));
  const grate = channel * (1 - smoothstep(0.055, 0.15, barDistance));
  const crack = context.cracks(uCoord, vCoord).crack;
  const puddleNoise = broad * 0.72 + (1 - fine) * 0.28;
  const puddle = smoothstep(0.5 - context.wetness * 0.22, 0.68, puddleNoise) * (1 - channelRim);
  const wetMask = clamp01(Math.max(channel * 0.9, puddle) * context.wetness);
  const grime = clamp01((channel * 0.55 + crack * 0.45) * (0.45 + fine * 0.55));
  const concrete = shade(context.color, 0.78 + broad * 0.18 - grime * 0.34);
  const wetColor = shade(context.accentColor, 0.52 + fine * 0.14);
  return {
    color: mixColor(concrete, wetColor, wetMask * 0.86),
    height: clamp01(0.5 + channelRim * 0.16 + grate * 0.22 - channel * 0.3 - crack * context.wear * 0.16 + fine * 0.04),
    metallic: grate * 0.86,
    roughness: clamp01(0.84 - wetMask * 0.62 - grate * 0.2 + fine * 0.08),
    ao: clamp01(1 - channel * 0.56 - crack * 0.3 + grate * 0.22),
  };
}

function sampleMaterial(context: PatternContext, uCoord: number, vCoord: number): SurfaceSample {
  switch (context.definition.kind) {
    case "urbanGroundKit": return sampleUrbanGround(context, uCoord, vCoord);
    case "damagedPlasterBrick": return sampleDamagedWall(context, uCoord, vCoord);
    case "sciFiIndustrialPanel": return sampleSciFiPanel(context, uCoord, vCoord);
    case "brushedMetalGrille": return sampleMetalGrille(context, uCoord, vCoord);
    case "wetDrainConcrete": return sampleWetDrain(context, uCoord, vCoord);
  }
}

export function buildUrbanMaterial(
  definition: UrbanMaterialDefinition,
  params: UrbanMaterialParams = {},
): MaterialFields {
  const seed = params.seed ?? definition.seed;
  const scale = params.scale ?? definition.scale;
  const detail = params.detail ?? definition.detail;
  const wear = params.wear ?? definition.wear;
  const brickOptions = {
    columns: Math.max(3, Math.round(scale * 0.7)),
    rows: Math.max(5, Math.round(scale * 1.25)),
    mortar: 0.055,
    offset: 0.5,
    rotationVariation: 0.035,
    bevel: 0.075,
    heightVariation: 0.2,
    chipAmount: wear * 0.42,
    chipScale: 0.075,
    seed: seed + 29,
  };
  const context: PatternContext = {
    definition,
    seed,
    scale,
    detail,
    wear,
    wetness: params.wetness ?? definition.wetness,
    color: params.color ?? definition.color,
    accentColor: params.accentColor ?? definition.accentColor,
    broadNoise: makeNoise(seed),
    fineNoise: makeNoise(seed + 101),
    cells: voronoi({ scale: Math.max(4, scale * 1.35), seed: seed + 17, metric: "f1" }),
    bricks: {
      mask: brick(brickOptions),
      height: brickHeight(brickOptions),
      value: brickValue(brickOptions),
    },
    cracks: crackGenerator({
      seed: seed + 37,
      count: Math.max(2, Math.round(scale * 0.4)),
      branches: Math.max(2, Math.round(scale * 0.75)),
      width: 0.0025 + wear * 0.003,
      edgeDamage: wear,
    }),
    panels: panelGenerator({
      seed: seed + 53,
      columns: Math.max(3, Math.round(scale * 0.55)),
      rows: Math.max(3, Math.round(scale * 0.55)),
      ventChance: 0.34,
    }),
    cables: cableGenerator({
      seed: seed + 71,
      count: 3,
      width: 0.018,
      amplitude: 0.075,
      frequency: 1.8,
      orientation: "crossed",
    }),
  };
  const sample = (uCoord: number, vCoord: number) => sampleMaterial(context, uCoord, vCoord);
  return {
    baseColor: (uCoord, vCoord) => sample(uCoord, vCoord).color,
    metallic: (uCoord, vCoord) => sample(uCoord, vCoord).metallic,
    roughness: (uCoord, vCoord) => sample(uCoord, vCoord).roughness,
    ao: (uCoord, vCoord) => sample(uCoord, vCoord).ao,
    height: (uCoord, vCoord) => sample(uCoord, vCoord).height,
    normalStrength: definition.normalStrength,
  };
}

function finishLayer(base: Material, kind: UrbanMaterialKind): Material {
  const brighten = kind === "sciFiIndustrialPanel" || kind === "brushedMetalGrille";
  const colorFactor = brighten ? 1.12 : kind === "wetDrainConcrete" ? 0.62 : 0.78;
  const roughnessFactor = kind === "wetDrainConcrete" ? 0.48 : brighten ? 1.18 : 1.12;
  return {
    ...base,
    baseColor: mapAll(base.baseColor, (value) => clamp01(value * colorFactor)),
    roughness: mapAll(base.roughness, (value) => clamp(value * roughnessFactor, 0.04, 1)),
    ao: mapAll(base.ao, (value) => clamp01(value * (brighten ? 1 : 0.88))),
  };
}

/**
 * High-quality buffer-chain bake used by exports and the material lab. It keeps
 * the field recipe API intact while adding normalized height, slope erosion,
 * semantic PBR layering and a recomputed normal map.
 */
export function bakeUrbanMaterial(
  name: UrbanMaterialName,
  size: number,
  params: UrbanMaterialParams = {},
): Material {
  const definition = URBAN_MATERIAL_DEFINITIONS[name];
  const wear = clamp01(params.wear ?? definition.wear);
  const wetness = clamp01(params.wetness ?? definition.wetness);
  const raw = materialFromFields(size, buildUrbanMaterial(definition, params));
  const normalizedHeight = autoLevels(raw.height, {
    lowPercentile: 0.005,
    highPercentile: 0.005,
  });
  const organic = definition.kind === "urbanGroundKit" ||
    definition.kind === "damagedPlasterBrick" ||
    definition.kind === "wetDrainConcrete";
  const height = organic
    ? slopeBlur(normalizedHeight, raw.height, { intensity: 0.8, samples: 3, mode: "min" })
    : normalizedHeight;
  const base: Material = {
    ...raw,
    height,
    normal: scaleNormal(heightToNormal(height, definition.normalStrength), 1.08),
  };

  const maskOptions = definition.kind === "wetDrainConcrete"
    ? {
        heightRange: [0, 0.62] as [number, number],
        slopeRange: [0, 0.72] as [number, number],
        aoRange: [0, 0.94] as [number, number],
        wetness,
        wetnessRange: [0.02, 1] as [number, number],
        softness: 0.12,
      }
    : definition.kind === "sciFiIndustrialPanel" || definition.kind === "brushedMetalGrille"
      ? {
          slopeRange: [0.08, 1] as [number, number],
          curvatureRange: [0.5, 1] as [number, number],
          softness: 0.1,
        }
      : {
          heightRange: [0, 0.58] as [number, number],
          curvatureRange: [0, 0.55] as [number, number],
          aoRange: [0, 0.94] as [number, number],
          softness: 0.12,
        };
  const mask = semanticLayerMask(height, maskOptions);
  const opacity = definition.kind === "wetDrainConcrete"
    ? 0.82
    : definition.kind === "urbanGroundKit"
      ? clamp01(0.18 + wear * 0.4 + wetness * 0.18)
      : clamp01(0.12 + wear * 0.42);
  return layerMaterials(base, [{
    material: finishLayer(base, definition.kind),
    mask,
    opacity,
  }]);
}

export const URBAN_MATERIAL_DEFINITIONS = {
  urbanGroundKit: {
    label: "城市地面套件",
    description: "鹅卵石、人行道、分段路缘石与排水沟组合地表",
    kind: "urbanGroundKit",
    seed: 60,
    scale: 8,
    detail: 4,
    wear: 0.4,
    wetness: 0.22,
    color: [0.48, 0.47, 0.43],
    accentColor: [0.25, 0.23, 0.2],
    normalStrength: 6,
  },
  damagedPlasterBrick: {
    label: "破损灰泥砖墙",
    description: "灰泥剥落、砖块变化、灰浆、裂缝与边缘破损",
    kind: "damagedPlasterBrick",
    seed: 41,
    scale: 7,
    detail: 5,
    wear: 0.58,
    wetness: 0,
    color: [0.61, 0.56, 0.46],
    accentColor: [0.48, 0.16, 0.075],
    normalStrength: 6,
  },
  sciFiIndustrialPanel: {
    label: "科幻工业金属面板",
    description: "嵌板、通风口、铆钉、电缆、警示漆与划痕",
    kind: "sciFiIndustrialPanel",
    seed: 73,
    scale: 7,
    detail: 5,
    wear: 0.38,
    wetness: 0,
    color: [0.19, 0.23, 0.25],
    accentColor: [0.54, 0.12, 0.055],
    normalStrength: 5,
  },
  brushedMetalGrille: {
    label: "磨砂金属格栅",
    description: "冲孔格栅、拉丝微表面、边框与随机划痕",
    kind: "brushedMetalGrille",
    seed: 84,
    scale: 9,
    detail: 5,
    wear: 0.3,
    wetness: 0,
    color: [0.47, 0.5, 0.52],
    accentColor: [0.045, 0.05, 0.055],
    normalStrength: 5,
  },
  wetDrainConcrete: {
    label: "湿润沟渠与脏混凝土",
    description: "排水沟、金属格栅、积水、干湿粗糙度与污垢遮罩",
    kind: "wetDrainConcrete",
    seed: 95,
    scale: 8,
    detail: 5,
    wear: 0.46,
    wetness: 0.78,
    color: [0.42, 0.43, 0.41],
    accentColor: [0.12, 0.15, 0.13],
    normalStrength: 5,
  },
} as const satisfies Record<string, UrbanMaterialDefinition>;

export type UrbanMaterialName = keyof typeof URBAN_MATERIAL_DEFINITIONS;

function recipe(name: UrbanMaterialName) {
  return (params: UrbanMaterialParams = {}) => buildUrbanMaterial(URBAN_MATERIAL_DEFINITIONS[name], params);
}

export const URBAN_MATERIALS = {
  urbanGroundKit: recipe("urbanGroundKit"),
  damagedPlasterBrick: recipe("damagedPlasterBrick"),
  sciFiIndustrialPanel: recipe("sciFiIndustrialPanel"),
  brushedMetalGrille: recipe("brushedMetalGrille"),
  wetDrainConcrete: recipe("wetDrainConcrete"),
} as const;

export const URBAN_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  Object.entries(URBAN_MATERIAL_DEFINITIONS).map(([name, definition]) => [name, [
    { key: "seed", label: "随机种子", type: "range", min: 0, max: 999, step: 1, default: definition.seed },
    { key: "scale", label: "结构密度", type: "range", min: 3, max: 24, step: 0.5, default: definition.scale },
    { key: "detail", label: "细节层级", type: "range", min: 1, max: 8, step: 0.25, default: definition.detail },
    { key: "wear", label: "破损磨损", type: "range", min: 0, max: 1, step: 0.02, default: definition.wear },
    { key: "wetness", label: "潮湿程度", type: "range", min: 0, max: 1, step: 0.02, default: definition.wetness },
    { key: "color", label: "主体颜色", type: "rgb", default: definition.color },
    { key: "accentColor", label: "次要颜色", type: "rgb", default: definition.accentColor },
  ] satisfies UrbanMaterialParamSpec[]]),
) as Record<UrbanMaterialName, UrbanMaterialParamSpec[]>;

export function defaultUrbanMaterialParams(name: UrbanMaterialName): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const spec of URBAN_MATERIAL_PARAM_SCHEMA[name]) {
    params[spec.key] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  return params;
}
