import {
  bounds,
  box,
  cone,
  cylinder,
  frustum,
  icosphere,
  merge,
  plane,
  rotateMesh,
  scaleMesh,
  styleLowPolyMesh,
  torus,
  translateMesh,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { BLENDER_119_PALETTES, type Blender119Palette } from "./blender-119-palettes.js";
import { buildBuildingParts, buildCityBlockParts, type RoofType } from "./building.js";
import { buildPcgCartoonHouseParts } from "./pcg-cartoon-house.js";
import { buildProceduralWaterwheelParts } from "./procedural-waterwheel.js";
import { buildRailwayParts } from "./railway.js";
import { buildStylizedLakesideVillageParts } from "./stylized-lakeside-village.js";
import { buildTerrainIslandParts } from "./terrain.js";
import { buildVegetationAssemblyPreset } from "./vegetation-assembly.js";
import { buildWaterfallParts } from "./waterfall.js";

export type Blender119Theme =
  | "rural"
  | "urban"
  | "cyber"
  | "water"
  | "coast"
  | "mountain"
  | "fantasy"
  | "vehicle"
  | "character"
  | "weather"
  | "effects"
  | "landmark"
  | "industrial"
  | "showcase";

export interface Blender119SceneSpec {
  page: number;
  id: string;
  name: string;
  theme: Blender119Theme;
}

export interface Blender119SceneOptions {
  seed?: number;
  colorVariation?: number;
  density?: number;
  scale?: number;
}

const SOURCE_URL = "https://www.bilibili.com/video/BV1nx421972j";

const SCENES: Array<[string, string, Blender119Theme]> = [
  ["little-scene", "小场景一", "rural"],
  ["lakeside-cafes", "湖畔咖啡馆", "water"],
  ["solitude", "独处", "mountain"],
  ["rainy-days", "雨天", "weather"],
  ["street-corner", "街角", "urban"],
  ["new-dawn", "新黎明", "rural"],
  ["windmill-animation", "风车动画场景", "industrial"],
  ["scorching-day", "炙热之日", "industrial"],
  ["morning-call", "清晨呼唤", "rural"],
  ["vanishing-car", "消失的汽车", "vehicle"],
  ["bright-night", "明亮之夜", "urban"],
  ["full-moon", "满月", "fantasy"],
  ["pyramid-origins", "金字塔·起源", "landmark"],
  ["paradise", "天堂", "coast"],
  ["off-grid-cabin", "离网木屋", "rural"],
  ["railroad", "铁路", "industrial"],
  ["main-street", "主街", "urban"],
  ["downtown", "市中心", "urban"],
  ["metropolis", "大都会", "urban"],
  ["night-light", "夜灯", "urban"],
  ["stream-town", "溪流小镇", "water"],
  ["windy-town", "风中小镇", "rural"],
  ["lake-view", "湖景", "water"],
  ["neon-street", "霓虹街", "cyber"],
  ["watery-town", "水乡", "water"],
  ["culture", "文化", "landmark"],
  ["riverside", "河畔", "water"],
  ["blossom-town", "花开小镇", "rural"],
  ["seaside", "海滨", "coast"],
  ["popup-animation", "弹出动画场景", "showcase"],
  ["old-town", "老城", "rural"],
  ["unbreachable", "坚不可摧", "landmark"],
  ["market", "市集", "water"],
  ["plaza", "广场", "urban"],
  ["sky-lighting", "天空光照场景", "showcase"],
  ["king-of-hill", "山丘之王", "mountain"],
  ["dragon-gate", "龙门", "landmark"],
  ["hill-tram", "山地电车", "industrial"],
  ["up-and-down", "上上下下", "mountain"],
  ["discovery", "发现", "fantasy"],
  ["crash-landing", "坠毁", "vehicle"],
  ["archangel", "大天使", "character"],
  ["deity", "神祇", "character"],
  ["transparent-background", "透明背景场景", "showcase"],
  ["slow-and-furious", "缓慢与激情", "vehicle"],
  ["summoning", "召唤", "fantasy"],
  ["good-day-to-fly", "飞行好日子", "vehicle"],
  ["lakeside", "湖畔", "water"],
  ["what-the-world", "世界何物", "fantasy"],
  ["northern-inn", "北境旅店", "rural"],
  ["forest-camp", "森林营地", "rural"],
  ["sizes", "尺度", "coast"],
  ["passing-by", "路过", "vehicle"],
  ["coastal-defender", "海岸守卫", "coast"],
  ["cyberpunk-night-life-2", "赛博夜生活二", "cyber"],
  ["failed-plan", "失败计划", "effects"],
  ["alien-attack", "外星袭击", "effects"],
  ["stranded", "搁浅", "coast"],
  ["year-progress", "三百六十五天作品集", "showcase"],
  ["first-scene-remake", "首作重制", "showcase"],
  ["peaceful-village", "宁静村庄", "rural"],
  ["cyberpunk-smart-city", "赛博智慧城", "cyber"],
  ["blessed", "赐福", "coast"],
  ["bullseye", "正中靶心", "rural"],
  ["rain-maker", "造雨者", "weather"],
  ["going-up", "向上", "urban"],
  ["chaser", "追逐者", "vehicle"],
  ["drifting", "漂移", "vehicle"],
  ["liquid-simulation", "液体模拟场景", "effects"],
  ["tram", "电车", "industrial"],
  ["waterfall", "瀑布", "water"],
  ["storm-in-box", "盒中风暴", "weather"],
  ["winter-cabin", "冬日木屋", "weather"],
  ["washed-away", "冲走", "water"],
  ["fire-smoke-compilation", "火焰烟雾合集", "effects"],
  ["rebirth", "重生", "effects"],
  ["survivor", "幸存者", "effects"],
  ["fire", "烈火", "effects"],
  ["winters-coming", "寒冬将至", "weather"],
  ["summer-time", "盛夏", "coast"],
  ["cyberpunk-night-life", "赛博夜生活", "cyber"],
  ["pumpkin", "南瓜", "fantasy"],
  ["good-evening-bricks", "晚安砖墙", "urban"],
  ["looping-ocean-final", "循环海洋·成片", "coast"],
  ["looping-ocean-lighting", "循环海洋·灯光", "coast"],
  ["looping-ocean-animation", "循环海洋·动画", "coast"],
  ["looping-ocean-modeling", "循环海洋·建模", "coast"],
  ["night-howl", "夜嚎", "character"],
  ["long-wait", "漫长等待", "coast"],
  ["hunted", "猎杀", "coast"],
  ["still-worthy", "仍然值得", "character"],
  ["natures-wrath", "自然之怒", "weather"],
  ["grand-final", "最终决战", "character"],
  ["guardian", "守护者", "character"],
  ["one-more", "再来一次", "character"],
  ["low-spec-scene", "低配电脑场景", "showcase"],
  ["submacopter", "潜艇直升机", "vehicle"],
  ["last-stop", "最后一站", "industrial"],
  ["basic-popup-animation", "基础弹出动画", "showcase"],
  ["master", "大师", "character"],
  ["half-year-progress", "半年作品集", "showcase"],
  ["fairy-tale", "童话", "fantasy"],
  ["strategy", "策略", "character"],
  ["good-day-to-fly-path", "飞行好日子·路径", "vehicle"],
  ["off-grid-wagon", "离网马车", "vehicle"],
  ["water-wheel", "水车场景", "industrial"],
  ["fire-wizard", "火焰法师", "character"],
  ["lightning-strike", "雷击", "weather"],
  ["endless-journey", "无尽旅程", "vehicle"],
  ["simple-magic", "简单魔法", "fantasy"],
  ["isolation-mode", "隔离模式", "mountain"],
  ["lost-trident", "失落三叉戟", "fantasy"],
  ["sketch-character", "二维角色三维化", "character"],
  ["serenity", "宁静", "water"],
  ["angels-garden", "天使花园", "fantasy"],
  ["cloud-portal", "云端传送门", "fantasy"],
  ["forgotten-cannon", "遗忘大炮", "landmark"],
  ["somewhere-in-bali", "巴厘岛某处", "coast"],
  ["thirty-day-progress", "三十天作品集", "showcase"],
];

export const BLENDER_119_SCENES: Blender119SceneSpec[] = SCENES.map(([slug, name, theme], index) => ({
  page: index + 1,
  id: `blender-119-${String(index + 1).padStart(3, "0")}-${slug}`,
  name,
  theme,
}));

const PALETTES: Record<Blender119Theme, Blender119Palette> = {
  rural: { ground: [0.36, 0.55, 0.2], structure: [0.54, 0.34, 0.2], accent: [0.82, 0.48, 0.2], sky: [0.84, 0.9, 0.9], vegetation: [0.2, 0.46, 0.14] },
  urban: { ground: [0.24, 0.25, 0.27], structure: [0.46, 0.43, 0.39], accent: [0.75, 0.42, 0.18], sky: [0.66, 0.7, 0.76], vegetation: [0.18, 0.34, 0.22] },
  cyber: { ground: [0.08, 0.09, 0.15], structure: [0.16, 0.2, 0.32], accent: [0.93, 0.08, 0.63], sky: [0.09, 0.06, 0.19], vegetation: [0.1, 0.42, 0.38] },
  water: { ground: [0.16, 0.5, 0.66], structure: [0.58, 0.4, 0.24], accent: [0.88, 0.66, 0.28], sky: [0.78, 0.88, 0.91], vegetation: [0.22, 0.5, 0.24] },
  coast: { ground: [0.1, 0.48, 0.7], structure: [0.72, 0.58, 0.36], accent: [0.92, 0.58, 0.22], sky: [0.76, 0.9, 0.93], vegetation: [0.2, 0.54, 0.22] },
  mountain: { ground: [0.26, 0.38, 0.2], structure: [0.38, 0.34, 0.3], accent: [0.7, 0.46, 0.24], sky: [0.72, 0.8, 0.83], vegetation: [0.18, 0.4, 0.16] },
  fantasy: { ground: [0.16, 0.2, 0.28], structure: [0.42, 0.32, 0.5], accent: [0.38, 0.82, 0.95], sky: [0.14, 0.09, 0.25], vegetation: [0.22, 0.46, 0.34] },
  vehicle: { ground: [0.25, 0.27, 0.29], structure: [0.2, 0.3, 0.4], accent: [0.86, 0.2, 0.08], sky: [0.62, 0.72, 0.78], vegetation: [0.18, 0.34, 0.2] },
  character: { ground: [0.24, 0.27, 0.22], structure: [0.46, 0.34, 0.26], accent: [0.86, 0.36, 0.12], sky: [0.48, 0.56, 0.66], vegetation: [0.23, 0.4, 0.18] },
  weather: { ground: [0.2, 0.31, 0.29], structure: [0.4, 0.35, 0.32], accent: [0.45, 0.68, 0.88], sky: [0.24, 0.31, 0.4], vegetation: [0.16, 0.36, 0.26] },
  effects: { ground: [0.14, 0.17, 0.22], structure: [0.34, 0.29, 0.25], accent: [0.96, 0.27, 0.04], sky: [0.14, 0.13, 0.2], vegetation: [0.18, 0.32, 0.16] },
  landmark: { ground: [0.52, 0.44, 0.26], structure: [0.62, 0.45, 0.26], accent: [0.78, 0.18, 0.08], sky: [0.78, 0.74, 0.62], vegetation: [0.24, 0.42, 0.16] },
  industrial: { ground: [0.24, 0.3, 0.26], structure: [0.38, 0.31, 0.24], accent: [0.72, 0.24, 0.1], sky: [0.65, 0.72, 0.7], vegetation: [0.19, 0.37, 0.19] },
  showcase: { ground: [0.28, 0.31, 0.36], structure: [0.48, 0.55, 0.65], accent: [0.95, 0.55, 0.12], sky: [0.76, 0.82, 0.88], vegetation: [0.22, 0.48, 0.3] },
};

type PaletteRole = keyof Blender119Palette;

const NIGHT_THEMES = new Set<Blender119Theme>(["cyber", "fantasy", "weather", "effects"]);
const DAYLIGHT_FLOORS: Record<PaletteRole, number> = {
  ground: 0.16,
  structure: 0.22,
  accent: 0.28,
  sky: 0.3,
  vegetation: 0.18,
};
const NIGHT_FLOORS: Record<PaletteRole, number> = {
  ground: 0.09,
  structure: 0.15,
  accent: 0.24,
  sky: 0.13,
  vegetation: 0.13,
};

function placed(mesh: Mesh, position: [number, number, number], scale: [number, number, number] = [1, 1, 1], rotation: [number, number, number] = [0, 0, 0]): Mesh {
  return translateMesh(rotateMesh(scaleMesh(mesh, vec3(...scale)), vec3(...rotation)), vec3(...position));
}

function addPart(parts: NamedPart[], meshes: Mesh[], key: string, label: string, color: LowPolyColor, seed: number, variation: number, doubleSided = false): void {
  if (meshes.length === 0) return;
  const styled = styleLowPolyMesh(meshes.length === 1 ? meshes[0]! : merge(...meshes), color, { seed, colorVariation: variation });
  const clearance = key.endsWith("_vegetation")
    ? vec3(0, 0.03, 0)
    : key.endsWith("_accents")
      ? vec3(0, 0.015, 0.03)
      : vec3(0, 0, 0);
  parts.push({
    name: key,
    label,
    mesh: translateMesh(styled.mesh, clearance),
    colors: styled.colors,
    color,
    doubleSided,
    metadata: { style: "low-poly", sourceStudy: SOURCE_URL, castShadow: true },
  });
}

interface SceneBuildingOptions {
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  height: number;
  seed: number;
  yaw?: number;
  roof?: RoofType;
}

function sceneBuilding(options: SceneBuildingOptions): Mesh {
  const floors = Math.max(1, Math.round(options.floors));
  const groundFloorScale = floors === 1 ? 1 : 1.18;
  const floorHeight = options.height / (floors - 1 + groundFloorScale);
  const roof = options.roof ?? "flat";
  const parts = buildBuildingParts({
    width: options.width,
    depth: options.depth,
    floors,
    floorHeight,
    groundFloorScale,
    baysX: Math.max(2, Math.round(options.width / 0.85)),
    baysZ: Math.max(2, Math.round(options.depth / 0.85)),
    roof,
    roofHeight: roof === "flat" ? 0.2 : Math.max(0.45, options.height * 0.32),
    setback: floors >= 6 ? 0.025 : 0,
    balconyEvery: floors >= 4 && options.seed % 3 === 0 ? 2 : 0,
    corners: true,
    canopy: true,
    seed: options.seed,
  });
  return placed(
    merge(...parts.map((part) => part.mesh)),
    [options.x, 0, options.z],
    [1, 1, 1],
    [0, options.yaw ?? 0, 0],
  );
}

function cabin(x: number, z: number, size: number, yaw: number): Mesh[] {
  const seed = Math.abs(Math.round(x * 193 + z * 389 + size * 997 + yaw * 1597));
  return [sceneBuilding({
    x,
    z,
    width: size * 1.7,
    depth: size * 1.35,
    floors: 1,
    height: size,
    seed,
    yaw,
    roof: "gable",
  })];
}

function castle(x: number, z: number, size: number): Mesh[] {
  const meshes: Mesh[] = [
    placed(box(size * 4.8, size * 1.2, size * 3.4), [x, size * 0.6, z]),
    placed(box(size * 3.2, size * 2.4, size * 2.2), [x, size * 1.8, z]),
    placed(cone(size * 2.15, size * 1.5, 4), [x, size * 3.75, z], [1, 0.7, 1], [0, Math.PI * 0.25, 0]),
  ];
  for (const towerX of [-1.85, 1.85]) for (const towerZ of [-1.2, 1.2]) {
    meshes.push(placed(cylinder(size * 0.62, size * 3.6, 8), [x + towerX * size, size * 1.8, z + towerZ * size]));
    meshes.push(placed(cone(size * 0.86, size * 1.7, 8), [x + towerX * size, size * 4.1, z + towerZ * size]));
  }
  return meshes;
}

function tree(x: number, z: number, size: number, seed: number): { trunk: Mesh; crown: Mesh } {
  const rng = makeRng(seed);
  return {
    trunk: placed(frustum(size * 0.11, size * 0.075, size * 1.3, 6), [x, size * 0.65, z]),
    crown: placed(icosphere(size * 0.62, 1), [x, size * 1.55, z], [rng.range(0.8, 1.2), rng.range(0.85, 1.25), rng.range(0.8, 1.2)], [0, rng.range(-Math.PI, Math.PI), 0]),
  };
}

function wheel(x: number, y: number, z: number, radius: number, yaw = 0): Mesh[] {
  const meshes = [placed(torus(radius, radius * 0.12, 8, 5), [x, y, z], [1, 1, 1], [Math.PI * 0.5, yaw, 0])];
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI;
    meshes.push(placed(box(radius * 1.75, radius * 0.1, radius * 0.1), [x, y, z], [1, 1, 1], [0, yaw, angle]));
  }
  return meshes;
}

function humanoid(x: number, z: number, size: number): Mesh[] {
  return [
    placed(cylinder(size * 0.24, size * 1.05, 7), [x, size * 1.25, z]),
    placed(icosphere(size * 0.34, 1), [x, size * 2, z]),
    placed(cylinder(size * 0.1, size * 0.95, 6), [x - size * 0.22, size * 0.48, z], [1, 1, 1], [0, 0, 0.08]),
    placed(cylinder(size * 0.1, size * 0.95, 6), [x + size * 0.22, size * 0.48, z], [1, 1, 1], [0, 0, -0.08]),
  ];
}

function vehicle(x: number, z: number, size: number, airborne: boolean): Mesh[] {
  const y = airborne ? 3.2 : size * 0.45;
  const meshes = [
    placed(box(size * 2.4, size * 0.55, size * 1.05), [x, y, z]),
    placed(box(size * 1.2, size * 0.45, size * 0.88), [x - size * 0.15, y + size * 0.48, z]),
  ];
  if (airborne) {
    meshes.push(placed(box(size * 0.65, size * 0.08, size * 3.8), [x, y, z]));
    meshes.push(placed(box(size * 0.7, size * 0.08, size * 1.6), [x - size * 1.05, y + size * 0.3, z]));
  } else {
    for (const wheelX of [-0.72, 0.72]) for (const wheelZ of [-0.48, 0.48]) {
      meshes.push(placed(cylinder(size * 0.25, size * 0.18, 10), [x + wheelX * size, y - size * 0.33, z + wheelZ * size], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
    }
  }
  return meshes;
}

function tram(x: number, z: number, size: number, cars: number): Mesh[] {
  const meshes: Mesh[] = [];
  for (let index = 0; index < cars; index++) {
    const carX = x + (index - (cars - 1) * 0.5) * size * 2.15;
    meshes.push(placed(box(size * 2, size * 1.05, size), [carX, size * 0.72, z]));
    meshes.push(placed(box(size * 1.72, size * 0.48, size * 1.03), [carX, size * 1.42, z]));
    for (const wheelX of [-0.62, 0.62]) {
      meshes.push(placed(cylinder(size * 0.2, size * 0.16, 10), [carX + wheelX * size, size * 0.18, z - size * 0.46], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
      meshes.push(placed(cylinder(size * 0.2, size * 0.16, 10), [carX + wheelX * size, size * 0.18, z + size * 0.46], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
    }
  }
  return meshes;
}

function railPair(length: number, z = 0): Mesh[] {
  const meshes = [
    placed(box(length, 0.12, 0.16), [0, 0.06, z - 0.58]),
    placed(box(length, 0.12, 0.16), [0, 0.06, z + 0.58]),
  ];
  for (let x = -length * 0.5; x <= length * 0.5; x += 0.8) {
    meshes.push(placed(box(0.18, 0.08, 1.55), [x, 0.04, z]));
  }
  return meshes;
}

function titleHas(spec: Blender119SceneSpec, ...needles: string[]): boolean {
  return needles.some((needle) => spec.id.includes(needle));
}

function semanticPaletteColor(part: NamedPart, palette: Blender119Palette): LowPolyColor {
  const semantic = `${part.name} ${part.label ?? ""} ${part.surface?.type ?? ""}`.toLowerCase();
  if (/water|ocean|river|lake|pool|foam|sea/.test(semantic)) return palette.ground;
  if (/tree|leaf|grass|plant|flower|canop|foliage|frond|fern|shrub|veget/.test(semantic)) return palette.vegetation;
  if (/roof|window|door|sign|light|rail|trim|accent|sail|fish/.test(semantic)) return palette.accent;
  if (/sky|cloud|mist|atmos/.test(semantic)) return palette.sky;
  return palette.structure;
}

function mixColor(source: LowPolyColor, target: LowPolyColor, amount: number): LowPolyColor {
  return [
    source[0] + (target[0] - source[0]) * amount,
    source[1] + (target[1] - source[1]) * amount,
    source[2] + (target[2] - source[2]) * amount,
  ];
}

function colorLuminance(color: LowPolyColor): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function liftColor(color: LowPolyColor, minimumLuminance: number): LowPolyColor {
  const luminance = colorLuminance(color);
  if (luminance >= minimumLuminance) return color;
  const scale = Math.min(3, minimumLuminance / Math.max(0.001, luminance));
  return color.map((channel) => clamp01(channel * scale)) as LowPolyColor;
}

function harmonizeReferenceColor(reference: LowPolyColor, fallback: LowPolyColor, minimumLuminance: number): LowPolyColor {
  const luminance = colorLuminance(reference);
  const chroma = Math.max(...reference) - Math.min(...reference);
  const visibility = clamp01((luminance - 0.025) / 0.3);
  const colorSignal = clamp01(chroma / 0.28);
  const referenceWeight = 0.08 + visibility * 0.54 + colorSignal * 0.12;
  return liftColor(mixColor(fallback, reference, referenceWeight), minimumLuminance);
}

function scenePalette(spec: Blender119SceneSpec): Blender119Palette {
  const reference = BLENDER_119_PALETTES[spec.page - 1];
  const fallback = PALETTES[spec.theme];
  if (!reference) return fallback;
  const floors = NIGHT_THEMES.has(spec.theme) ? NIGHT_FLOORS : DAYLIGHT_FLOORS;
  return {
    ground: harmonizeReferenceColor(reference.ground, fallback.ground, floors.ground),
    structure: harmonizeReferenceColor(reference.structure, fallback.structure, floors.structure),
    accent: harmonizeReferenceColor(reference.accent, fallback.accent, floors.accent),
    sky: harmonizeReferenceColor(reference.sky, fallback.sky, floors.sky),
    vegetation: harmonizeReferenceColor(reference.vegetation, fallback.vegetation, floors.vegetation),
  };
}

function normalizeLibraryParts(
  spec: Blender119SceneSpec,
  sourceName: string,
  sourceParts: NamedPart[],
  palette: Blender119Palette,
  targetSpan = 13.5,
): NamedPart[] {
  const fitParts = sourceParts.filter((part) =>
    part.mesh.positions.length > 0 &&
    part.metadata?.cameraFitIgnore !== true &&
    !/ground|floor|ocean_surface|lake_water/.test(part.name),
  );
  const measured = fitParts.length > 0 ? fitParts : sourceParts;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of measured) {
    const partBounds = bounds(part.mesh);
    minX = Math.min(minX, partBounds.min.x);
    minY = Math.min(minY, partBounds.min.y);
    minZ = Math.min(minZ, partBounds.min.z);
    maxX = Math.max(maxX, partBounds.max.x);
    maxY = Math.max(maxY, partBounds.max.y);
    maxZ = Math.max(maxZ, partBounds.max.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, (maxY - minY) * 0.72, 0.001);
  const scale = targetSpan / span;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  return sourceParts.map((part, index) => {
    const targetColor = semanticPaletteColor(part, palette);
    const color = mixColor(part.color ?? targetColor, targetColor, 0.72);
    const scaled = scaleMesh(part.mesh, vec3(scale, scale, scale));
    const mesh = translateMesh(scaled, vec3(-centerX * scale, -minY * scale, -centerZ * scale));
    const colors = Array.from({ length: mesh.positions.length * 3 }, (_, channelIndex) => color[channelIndex % 3]!);
    const { renderInstances: _renderInstances, surface, ...rest } = part;
    return {
      ...rest,
      name: `${spec.id}_library_${sourceName}_${index}_${part.name}`,
      label: part.label ? `${part.label}（模型库）` : "模型库语义部件",
      mesh,
      color,
      colors,
      ...(surface ? { surface: { ...surface, params: { ...surface.params, color } } } : {}),
      metadata: { ...part.metadata, sourceStudy: SOURCE_URL, reusedFrom: sourceName },
    };
  });
}

function buildLibraryFoundation(
  spec: Blender119SceneSpec,
  seed: number,
  density: number,
  palette: Blender119Palette,
): NamedPart[] {
  let sourceName = "";
  let sourceParts: NamedPart[] = [];
  if (titleHas(spec, "main-street", "downtown", "metropolis", "night-light", "neon-street", "cyberpunk")) {
    sourceName = "city-block";
    sourceParts = buildCityBlockParts({
      cols: 3,
      rows: 2,
      minFloors: spec.theme === "cyber" ? 5 : 2,
      maxFloors: spec.theme === "cyber" ? 12 : 7,
      waterTowers: 0.25,
      seed,
    });
  } else if (titleHas(spec, "old-town", "stream-town", "windy-town", "watery-town", "riverside", "blossom-town", "peaceful-village", "lakeside", "summer-time", "somewhere-in-bali")) {
    sourceName = "stylized-lakeside-village";
    sourceParts = buildStylizedLakesideVillageParts({
      seed,
      treeDensity: Math.min(1.5, density),
      night: titleHas(spec, "night") ? 0.9 : 0,
      colorVariation: 0.06,
    });
  } else if (titleHas(spec, "off-grid-cabin", "northern-inn", "winter-cabin", "fairy-tale", "simple-magic")) {
    sourceName = "pcg-cartoon-house";
    sourceParts = buildPcgCartoonHouseParts({ seed, timberDensity: 0.9, windowCount: 8 });
  } else if (titleHas(spec, "solitude", "king-of-hill", "up-and-down", "unbreachable", "isolation-mode", "natures-wrath")) {
    sourceName = "terrain-island";
    sourceParts = buildTerrainIslandParts({
      size: 12,
      resolution: 20,
      height: 3.2,
      rocks: 12,
      trees: Math.round(16 * density),
      seed,
    });
  } else if (titleHas(spec, "forest-camp", "angels-garden", "blessed", "bullseye")) {
    sourceName = "vegetation-assembly";
    sourceParts = buildVegetationAssemblyPreset("woodland-edge", { seed, spread: 1.3, treeScale: 1.15, density });
  } else if (titleHas(spec, "railroad", "hill-tram", "last-stop") || spec.id.endsWith("-tram")) {
    sourceName = "railway";
    sourceParts = buildRailwayParts({ length: 22, bend: titleHas(spec, "hill-tram") ? 4 : 1.2, sample: 0.85 });
  } else if (titleHas(spec, "water-wheel")) {
    sourceName = "procedural-waterwheel";
    sourceParts = buildProceduralWaterwheelParts({ radius: 2.7, spokeCount: 10, paddleCount: 18, water: true });
  } else if (titleHas(spec, "waterfall")) {
    sourceName = "waterfall";
    sourceParts = buildWaterfallParts({
      seed,
      pathSegments: 24,
      rockCount: 16,
      particleCount: 36,
      mistCount: 18,
      foamCount: 28,
    });
  }
  return sourceParts.length > 0 ? normalizeLibraryParts(spec, sourceName, sourceParts, palette) : [];
}

export function buildBlender119SceneParts(scene: string | number | Blender119SceneSpec, options: Blender119SceneOptions = {}): NamedPart[] {
  const spec = typeof scene === "object"
    ? scene
    : typeof scene === "number"
      ? BLENDER_119_SCENES[scene - 1]
      : BLENDER_119_SCENES.find((candidate) => candidate.id === scene);
  if (!spec) throw new Error(`Unknown Blender 119 scene: ${String(scene)}`);

  const seed = options.seed ?? spec.page * 7919;
  const variation = options.colorVariation ?? 0.1;
  const density = Math.max(0.35, options.density ?? 1);
  const sceneScale = Math.max(0.35, options.scale ?? 1);
  const rng = makeRng(seed);
  const palette = scenePalette(spec);
  const parts: NamedPart[] = [];
  const ground: Mesh[] = [];
  const structures: Mesh[] = [];
  const vegetation: Mesh[] = [];
  const accents: Mesh[] = [];
  const effects: Mesh[] = [];
  const atmosphere: Mesh[] = [];
  const specialArchitecture = titleHas(
    spec,
    "lakeside-cafes",
    "solitude",
    "rainy-days",
    "street-corner",
    "new-dawn",
    "old-town",
    "market",
    "peaceful-village",
    "blessed",
    "bullseye",
    "grand-final",
    "guardian",
    "one-more",
    "liquid-simulation",
    "storm-in-box",
    "washed-away",
    "fairy-tale",
    "strategy",
    "off-grid-wagon",
    "simple-magic",
    "sketch-character",
    "serenity",
    "angels-garden",
  );
  const libraryFoundation = buildLibraryFoundation(spec, seed, density, palette);
  parts.push(...libraryFoundation);
  const hasLibraryFoundation = libraryFoundation.length > 0;

  if (["water", "coast"].includes(spec.theme)) {
    ground.push(placed(plane(22, 17, 2, 2), [0, -0.15, 0]));
    ground.push(placed(icosphere(1, 2), [0, 0, 0], [7.2, 0.7, 5.1]));
  } else {
    ground.push(placed(box(18, 0.35, 14), [0, -0.22, 0]));
  }

  if (["urban", "cyber"].includes(spec.theme) && !specialArchitecture && !hasLibraryFoundation) {
    const count = Math.round((8 + spec.page % 7) * density);
    for (let index = 0; index < count; index++) {
      const row = Math.floor(index / 4);
      const column = index % 4;
      const height = rng.range(1.8, spec.theme === "cyber" ? 7 : 4.8);
      const x = (column - 1.5) * 3.5 + rng.range(-0.35, 0.35);
      const z = (row - 1) * 4.2 + rng.range(-0.3, 0.3);
      const width = rng.range(1.6, 2.7);
      const depth = rng.range(1.6, 2.8);
      const floors = Math.max(2, Math.round(height / 0.85));
      structures.push(sceneBuilding({
        x,
        z,
        width,
        depth,
        floors,
        height,
        seed: seed + index * 101,
        roof: index % 4 === 0 && spec.theme !== "cyber" ? "hip" : "flat",
      }));
      if (spec.theme === "cyber") accents.push(placed(box(0.08, height * 0.72, 1.9), [x + 1.05, height * 0.54, z]));
    }
    accents.push(placed(box(2.1, 0.08, 14), [0, 0.04, 0]));
  }

  if (["rural", "water", "coast", "weather"].includes(spec.theme) && !specialArchitecture && !hasLibraryFoundation) {
    const count = Math.round((2 + spec.page % 4) * density);
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      structures.push(...cabin(Math.cos(angle) * rng.range(2.2, 5.8), Math.sin(angle) * rng.range(2, 4.5), rng.range(0.75, 1.25), rng.range(-Math.PI, Math.PI)));
    }
    const treeCount = Math.round((8 + spec.page % 9) * density);
    for (let index = 0; index < treeCount; index++) {
      const angle = rng.next() * Math.PI * 2;
      const treePart = tree(Math.cos(angle) * rng.range(4.2, 7.5), Math.sin(angle) * rng.range(3.4, 6), rng.range(0.65, 1.2), seed + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
    if (spec.theme === "coast") {
      structures.push(placed(box(3.4, 0.55, 1.15), [0, 0.45, -2.5]));
      structures.push(placed(box(1.25, 0.75, 0.9), [-0.35, 0.95, -2.5]));
      accents.push(placed(cylinder(0.06, 2.5, 6), [0.2, 1.75, -2.5]));
    }
  }

  if (spec.theme === "mountain" && !specialArchitecture && !hasLibraryFoundation) {
    for (let index = 0; index < Math.round(9 * density); index++) {
      const angle = (index / 9) * Math.PI * 2;
      structures.push(placed(cone(rng.range(1.8, 3.2), rng.range(3.5, 7.2), 5 + (index % 3)), [Math.cos(angle) * 5.5, rng.range(1.7, 3), Math.sin(angle) * 4.2], [1, 1, rng.range(0.8, 1.3)]));
    }
    structures.push(...cabin(0, 0, 1.1, 0.25));
  }

  if (["fantasy", "landmark"].includes(spec.theme) && !specialArchitecture) {
    if (titleHas(spec, "pyramid")) {
      structures.push(placed(cone(4.1, 5.8, 4), [0, 2.9, 0], [1, 1, 1], [0, Math.PI * 0.25, 0]));
    } else if (titleHas(spec, "culture")) {
      structures.push(placed(box(5.6, 1.4, 3.8), [0, 0.7, 0]));
      for (let level = 0; level < 3; level++) {
        structures.push(placed(box(4.8 - level * 1.05, 0.7, 3.3 - level * 0.62), [0, 1.75 + level * 1.05, 0]));
        accents.push(placed(cone(3.5 - level * 0.62, 0.55, 4), [0, 2.35 + level * 1.05, 0], [1.35, 0.45, 0.9], [0, Math.PI * 0.25, 0]));
      }
    } else if (titleHas(spec, "unbreachable")) {
      structures.push(...castle(0, 0, 1.15));
      for (const z of [-3.1, 3.1]) structures.push(placed(box(9.5, 2.1, 0.7), [0, 1.05, z]));
    } else if (titleHas(spec, "dragon-gate")) {
      for (const x of [-2.2, 2.2]) structures.push(placed(cylinder(0.55, 4.6, 8), [x, 2.3, 0]));
      structures.push(placed(box(5.7, 0.65, 1.25), [0, 4.25, 0]));
      accents.push(placed(cone(4.2, 0.9, 4), [0, 4.9, 0], [1, 0.45, 0.55], [0, Math.PI * 0.25, 0]));
    } else if (titleHas(spec, "what-the-world")) {
      structures.push(placed(icosphere(2.4, 2), [0, 2.6, 0]));
      accents.push(placed(torus(3.15, 0.12, 20, 6), [0, 2.6, 0], [1, 1, 1], [0.35, 0.2, 0.45]));
      accents.push(placed(torus(2.8, 0.09, 20, 6), [0, 2.6, 0], [1, 1, 1], [-0.5, 0.7, 0.1]));
    } else {
      structures.push(placed(box(5.8, 1.3, 3.2), [0, 0.65, 0]));
      for (const x of [-2.5, 2.5]) structures.push(placed(cylinder(0.85, 4.5, 7), [x, 2.25, 0]));
      structures.push(placed(box(5.8, 0.65, 0.7), [0, 3.8, 0]));
    }
    if (titleHas(spec, "summoning")) {
      effects.push(placed(torus(2.1, 0.2, 18, 7), [0, 0.28, 1.1]));
      effects.push(placed(torus(1.25, 0.12, 14, 6), [0, 0.3, 1.1]));
      structures.push(...humanoid(0, -1.1, 0.65));
    } else if (titleHas(spec, "cloud-portal")) {
      effects.push(placed(torus(1.75, 0.23, 16, 7), [0, 2.3, 1.15], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
      for (let index = 0; index < 7; index++) {
        const angle = (index / 7) * Math.PI * 2;
        atmosphere.push(placed(icosphere(0.8, 1), [Math.cos(angle) * 2.2, 2.3 + Math.sin(angle) * 1.7, 1.15], [1.4, 0.65, 0.8]));
      }
    } else if (titleHas(spec, "portal", "magic", "discovery")) {
      effects.push(placed(torus(1.75, 0.23, 16, 7), [0, 2.3, 1.15], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
      if (titleHas(spec, "discovery")) {
        for (let index = 0; index < 5; index++) accents.push(placed(cone(0.35, 1.8 + index * 0.22, 5), [-2.4 + index * 1.2, 0.9, 2.1]));
      }
    }
  }

  if (spec.theme === "vehicle" && !specialArchitecture) {
    const airborne = titleHas(spec, "fly", "landing", "submacopter", "chaser");
    if (titleHas(spec, "submacopter")) {
      structures.push(placed(icosphere(1.2, 2), [0, 2.9, 0], [2.5, 0.8, 1]));
      structures.push(placed(box(4.8, 0.12, 0.32), [0, 4.05, 0]));
      accents.push(placed(cylinder(0.12, 1.2, 8), [0, 3.5, 0]));
    } else if (titleHas(spec, "crash-landing")) {
      structures.push(placed(merge(...vehicle(0, 0, 1.35, true)), [0, 0, 0], [1, 1, 1], [0.25, 0.45, -0.48]));
      effects.push(placed(cone(0.55, 2.8, 7), [-2.8, 1.3, 0], [1, 1, 1], [0, 0, -1.05]));
    } else if (titleHas(spec, "chaser")) {
      structures.push(...vehicle(-2.2, -0.8, 1.05, true), ...vehicle(2.3, 1.2, 0.82, true));
    } else {
      structures.push(...vehicle(0, 0, 1.35, airborne));
      if (titleHas(spec, "good-day-to-fly-path")) {
        for (let index = 0; index < 8; index++) effects.push(placed(icosphere(0.12, 1), [-5 + index * 1.35, 1.2 + index * 0.55, Math.sin(index * 0.8) * 1.4]));
      }
    }
    if (!airborne) {
      accents.push(placed(box(15, 0.08, 3.2), [0, 0.02, 0]));
      if (titleHas(spec, "vanishing-car")) {
        for (let index = 1; index <= 3; index++) effects.push(placed(box(2.7 - index * 0.38, 0.5, 1.05), [-index * 1.55, 0.5 + index * 0.08, 0]));
      } else if (titleHas(spec, "slow-and-furious")) {
        structures.push(...vehicle(-3.4, 1.1, 0.82, false));
      } else if (titleHas(spec, "passing-by")) {
        accents.push(placed(box(0.18, 2.6, 0.18), [3.8, 1.3, -2.1]), placed(box(2.2, 1.1, 0.16), [3.8, 2.5, -2.1]));
      } else if (titleHas(spec, "drifting")) {
        effects.push(placed(torus(2.7, 0.08, 20, 5), [-0.8, 0.08, 0], [1, 1, 0.55]));
      }
    }
    if (titleHas(spec, "endless-journey")) {
      for (let index = 0; index < 10; index++) {
        const treePart = tree(rng.range(-7, 7), rng.range(-5, 5), rng.range(0.7, 1.15), seed + 1000 + index);
        vegetation.push(treePart.trunk, treePart.crown);
      }
    }
  }

  if (titleHas(spec, "lakeside-cafes")) {
    structures.push(
      sceneBuilding({ x: -1.9, z: -0.4, width: 4.4, depth: 3.2, floors: 2, height: 2.6, seed: seed + 11, roof: "hip" }),
      sceneBuilding({ x: 2, z: -0.5, width: 3.2, depth: 3, floors: 3, height: 3.6, seed: seed + 12, roof: "gable" }),
      placed(box(9.5, 0.25, 5.4), [0, 0.15, 0.8]),
    );
    for (let index = 0; index < 7; index++) {
      const x = -4.2 + index * 1.35;
      accents.push(placed(box(0.7, 0.85, 0.08), [x, 1.25 + (index % 2) * 1.05, 1.25]));
      accents.push(placed(cylinder(0.36, 0.12, 12), [x, 0.55, 2.35]));
    }
  }

  if (titleHas(spec, "solitude", "new-dawn")) {
    structures.push(...castle(0, 0, titleHas(spec, "solitude") ? 1.12 : 1.35));
    for (let index = 0; index < 11; index++) {
      const angle = (index / 11) * Math.PI * 2;
      const treePart = tree(Math.cos(angle) * 6.2, Math.sin(angle) * 4.7, rng.range(0.7, 1.15), seed + 300 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
  }

  if (titleHas(spec, "rainy-days")) {
    structures.push(
      sceneBuilding({ x: 0, z: -2.3, width: 7.2, depth: 3.2, floors: 3, height: 3.8, seed: seed + 21, roof: "hip" }),
      sceneBuilding({ x: -3.1, z: 0.7, width: 3.1, depth: 5.5, floors: 2, height: 2.8, seed: seed + 22, roof: "gable" }),
      placed(box(9.4, 0.18, 7.4), [0, 0.08, 0.2]),
    );
    for (let index = 0; index < 6; index++) {
      accents.push(placed(box(0.8, 1.05, 0.09), [-2.5 + index, 1.55 + (index % 2) * 1.35, -0.65]));
      accents.push(placed(cylinder(0.34, 0.12, 10), [-3.2 + index * 1.25, 0.52, 1.55]));
    }
  }

  if (titleHas(spec, "street-corner")) {
    structures.push(
      sceneBuilding({ x: -1.45, z: -0.5, width: 3.5, depth: 3.4, floors: 4, height: 4.6, seed: seed + 31, roof: "hip" }),
      sceneBuilding({ x: 2.15, z: 0.15, width: 4.6, depth: 3.2, floors: 2, height: 2.5, seed: seed + 32, roof: "hip" }),
    );
    accents.push(placed(box(0.52, 2.8, 0.12), [-3.25, 3.2, 1.25]));
    for (let index = 0; index < 6; index++) accents.push(placed(box(0.72, 0.95, 0.08), [-2.45 + index * 1.1, 1.35 + (index % 2) * 1.55, 1.82]));
  }

  if (titleHas(spec, "old-town")) {
    structures.push(...cabin(-2.1, 0, 1.45, 0.05), ...cabin(1.1, -0.2, 1.7, -0.05));
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2;
      const treePart = tree(Math.cos(angle) * 6, Math.sin(angle) * 4.7, rng.range(0.55, 0.95), seed + 500 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
    for (let index = 0; index < 5; index++) accents.push(placed(cylinder(0.38, 0.12, 10), [-3 + index * 1.5, 0.5, 2.4]));
  }

  if (titleHas(spec, "market")) {
    for (let index = 0; index < 8; index++) {
      const x = -4.6 + (index % 4) * 3;
      const z = -2 + Math.floor(index / 4) * 4;
      structures.push(placed(box(2.2, 0.35, 0.85), [x, 0.2, z]));
      accents.push(placed(cone(0.85, 0.65, 8), [x, 1.35, z]));
      accents.push(placed(cylinder(0.06, 1.45, 6), [x, 0.75, z]));
    }
    structures.push(placed(box(11, 0.22, 1.1), [0, 0.12, 0]));
  }

  if (titleHas(spec, "peaceful-village")) {
    structures.push(...cabin(-2.8, 1.4, 1.15, 0.15), ...cabin(2.6, -1.2, 1.05, -0.2));
    structures.push(placed(frustum(1.05, 0.7, 4.1, 8), [0, 2.05, 0]));
    accents.push(placed(box(0.32, 3.7, 0.16), [0, 3.55, 0.85], [1, 1, 1], [0, 0, Math.PI * 0.25]));
    accents.push(placed(box(0.32, 3.7, 0.16), [0, 3.55, 0.85], [1, 1, 1], [0, 0, -Math.PI * 0.25]));
    for (let index = 0; index < 10; index++) {
      const treePart = tree(rng.range(-7, 7), rng.range(-5, 5), rng.range(0.6, 1), seed + 600 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
  }

  if (titleHas(spec, "blessed")) {
    for (let index = 0; index < 11; index++) {
      const angle = (index / 11) * Math.PI * 2;
      structures.push(placed(cone(rng.range(0.7, 1.35), rng.range(1.8, 4.4), 5), [Math.cos(angle) * rng.range(2.2, 5.5), rng.range(0.8, 2.1), Math.sin(angle) * rng.range(1.8, 4.2)]));
    }
    for (let index = 0; index < 7; index++) {
      const treePart = tree(rng.range(-5, 5), rng.range(-3.8, 3.8), rng.range(0.7, 1.05), seed + 700 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
  }

  if (titleHas(spec, "bullseye")) {
    for (let index = 0; index < 13; index++) {
      const angle = (index / 13) * Math.PI * 2;
      const treePart = tree(Math.cos(angle) * 5.1, Math.sin(angle) * 4, rng.range(0.7, 1.05), seed + 800 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
    accents.push(placed(torus(1.25, 0.18, 16, 6), [0, 1.5, 0], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
    accents.push(placed(cylinder(0.09, 3.2, 6), [0, 1.6, 0], [1, 1, 1], [0, 0, Math.PI * 0.5]));
  }

  if (titleHas(spec, "grand-final")) {
    structures.push(placed(box(8.5, 3.8, 2.2), [0, 1.9, -3.2]), placed(box(10.5, 0.3, 8), [0, 0.12, 0]));
    for (let index = 0; index < 14; index++) structures.push(...humanoid(-4.2 + (index % 7) * 1.4, -2.5 + Math.floor(index / 7) * 1.2, 0.32));
    accents.push(placed(box(9.5, 0.22, 0.2), [0, 1.1, 2.7]));
  }

  if (titleHas(spec, "guardian")) {
    structures.push(...castle(0, 0, 0.92));
    accents.push(placed(cone(1.8, 4.2, 3), [-1.4, 3.2, -0.8], [0.45, 1, 1], [0, 0, -1.05]));
    accents.push(placed(cone(1.8, 4.2, 3), [1.4, 3.2, -0.8], [0.45, 1, 1], [0, 0, 1.05]));
  }

  if (titleHas(spec, "one-more")) {
    structures.push(placed(icosphere(1, 1), [0, 2.2, 0], [4.2, 3.2, 2.8]));
    structures.push(...humanoid(-0.8, -1.5, 0.72));
    const cliffTree = tree(1.2, -0.8, 1.1, seed + 900);
    vegetation.push(cliffTree.trunk, cliffTree.crown);
  }

  if (titleHas(spec, "liquid-simulation")) {
    structures.push(
      placed(icosphere(1, 1), [-2.2, 2.1, 0], [2.3, 2.8, 2]),
      placed(icosphere(1, 1), [2.2, 2.1, 0], [2.3, 2.8, 2]),
    );
    effects.push(placed(box(2.1, 4.3, 0.22), [0, 2.2, 0.6]));
  }

  if (titleHas(spec, "storm-in-box")) {
    structures.push(placed(box(4.2, 0.65, 1.45), [0, 0.55, 0]));
    structures.push(placed(box(2.1, 1.15, 1.05), [-0.35, 1.35, 0]));
    structures.push(placed(icosphere(1, 1), [-4.5, 2, 0], [1.6, 2.8, 1.7]));
    structures.push(placed(icosphere(1, 1), [4.5, 2.2, 0], [1.7, 3, 1.8]));
  }

  if (titleHas(spec, "washed-away")) {
    structures.push(placed(box(5.2, 0.6, 1.2), [0, 0.45, 0], [1, 1, 1], [0, 0.3, -0.18]));
    structures.push(placed(box(2.1, 1.2, 1), [-0.4, 1.15, 0], [1, 1, 1], [0, 0.3, -0.18]));
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      structures.push(placed(cone(rng.range(0.7, 1.35), rng.range(2, 4.8), 5), [Math.cos(angle) * 5.2, rng.range(1, 2.2), Math.sin(angle) * 3.8]));
    }
  }

  if (titleHas(spec, "fairy-tale")) {
    structures.push(placed(icosphere(1, 1), [-1.5, 1.5, 0], [3.7, 0.8, 3]), placed(icosphere(1, 1), [3.6, 1.2, 0.8], [1.8, 0.55, 1.5]));
    structures.push(...cabin(-1.6, 0, 1.05, 0.15));
    const fairyTree = tree(0.8, -0.4, 1.75, seed + 950);
    vegetation.push(fairyTree.trunk, fairyTree.crown);
  }

  if (titleHas(spec, "strategy")) {
    structures.push(...castle(0, -1.2, 0.85));
    for (let index = 0; index < 18; index++) structures.push(...humanoid(-4.5 + (index % 9) * 1.1, 2.5 + Math.floor(index / 9) * 1.1, 0.28));
  }

  if (titleHas(spec, "off-grid-wagon")) {
    structures.push(placed(box(3.3, 1.5, 1.65), [0, 1.2, 0]));
    structures.push(placed(cone(1.45, 1.1, 4), [0, 2.3, 0], [1.25, 0.65, 0.8], [0, Math.PI * 0.25, 0]));
    accents.push(...wheel(-1.05, 0.7, -0.95, 0.72), ...wheel(-1.05, 0.7, 0.95, 0.72));
    for (let index = 0; index < 8; index++) {
      const treePart = tree(rng.range(-6, 6), rng.range(-4.5, 4.5), rng.range(0.7, 1.1), seed + 980 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
  }

  if (titleHas(spec, "fire-wizard")) {
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2;
      effects.push(placed(cone(0.18 + (index % 3) * 0.08, 0.8 + (index % 4) * 0.22, 6), [Math.cos(angle) * 1.8, 0.6 + (index % 2) * 0.45, Math.sin(angle) * 1.8]));
    }
  }

  if (titleHas(spec, "simple-magic")) {
    structures.push(...cabin(0.8, 0, 1.45, 0.12));
    structures.push(...humanoid(-2.2, 0.2, 0.72));
    for (let index = 0; index < 7; index++) {
      const treePart = tree(rng.range(-6, 6), rng.range(-4, 4), rng.range(0.75, 1.2), seed + 1100 + index);
      vegetation.push(treePart.trunk, treePart.crown);
    }
    effects.push(placed(torus(0.65, 0.12, 12, 6), [-1.6, 2.2, 0], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
  }

  if (titleHas(spec, "sketch-character")) {
    structures.push(
      placed(cylinder(1.05, 2.6, 9), [0, 1.5, 0]),
      placed(icosphere(1.25, 2), [0, 3.55, 0], [1.1, 0.95, 0.9]),
      placed(icosphere(0.58, 1), [-0.48, 3.35, 0.92], [1, 0.72, 0.55]),
      placed(icosphere(0.58, 1), [0.48, 3.35, 0.92], [1, 0.72, 0.55]),
      placed(cone(0.46, 1.05, 3), [-0.72, 4.75, 0], [0.7, 1, 0.7], [0, 0, -0.25]),
      placed(cone(0.46, 1.05, 3), [0.72, 4.75, 0], [0.7, 1, 0.7], [0, 0, 0.25]),
      placed(cylinder(0.23, 2.1, 7), [-1.05, 1.65, 0], [1, 1, 1], [0, 0, -0.75]),
      placed(cylinder(0.23, 2.1, 7), [1.05, 1.65, 0], [1, 1, 1], [0, 0, 0.75]),
    );
  }

  if (titleHas(spec, "serenity")) {
    structures.push(placed(icosphere(1, 1), [-3.1, 2.6, 0], [2.6, 3.4, 2.2]), placed(icosphere(1, 1), [3.1, 2.5, 0], [2.6, 3.3, 2.2]));
    effects.push(placed(box(1.85, 4.8, 0.18), [0, 2.45, 0.7]));
    structures.push(placed(cylinder(0.9, 2.8, 6), [-3, 4.8, -0.2]));
    for (let level = 0; level < 3; level++) structures.push(placed(cone(1.4 - level * 0.22, 0.55, 4), [-3, 3.75 + level * 1.1, -0.2], [1.3, 0.45, 1.3], [0, Math.PI * 0.25, 0]));
  }

  if (titleHas(spec, "angels-garden")) {
    structures.push(placed(icosphere(1, 1), [0, 0.75, 0], [5, 0.9, 3.8]));
    structures.push(...humanoid(0, 0.4, 0.95));
    accents.push(placed(cone(1.5, 3.5, 3), [-1.05, 2.5, 0], [0.4, 1, 1], [0, 0, -1.05]));
    accents.push(placed(cone(1.5, 3.5, 3), [1.05, 2.5, 0], [0.4, 1, 1], [0, 0, 1.05]));
    effects.push(placed(box(1.4, 3.2, 0.18), [-3.2, 1.6, 0.6]));
  }

  if (spec.theme === "character" && !specialArchitecture) {
    structures.push(...humanoid(0, 0, 1.3));
    if (titleHas(spec, "deity")) {
      accents.push(placed(torus(0.72, 0.09, 14, 6), [0, 3.55, 0], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
      for (const side of [-1, 1]) accents.push(placed(cone(1.25, 3.6, 3), [side * 1.05, 2.2, -0.15], [0.45, 1, 1], [0, 0, side * 1.08]));
    } else if (titleHas(spec, "still-worthy")) {
      structures.push(placed(icosphere(1, 1), [-2.8, 0.75, 0.2], [1.8, 0.8, 1.5]));
      accents.push(placed(cylinder(0.16, 3.4, 8), [1.15, 1.75, 0], [1, 1, 1], [0, 0, -0.45]));
      accents.push(placed(box(1.25, 0.48, 0.48), [0.4, 3.1, 0], [1, 1, 1], [0, 0, -0.45]));
    } else if (titleHas(spec, "master")) {
      structures.push(...humanoid(-3.2, 1.2, 0.72), ...humanoid(3.2, 1.2, 0.72));
      accents.push(placed(cylinder(0.1, 4.8, 8), [1.25, 2.4, 0], [1, 1, 1], [0, 0, 0.28]));
    } else {
      structures.push(...humanoid(-3.2, 1.2, 0.82));
    }
    if (titleHas(spec, "angel", "guardian")) {
      accents.push(placed(cone(1.4, 3.5, 3), [-1.25, 2.2, 0.2], [0.4, 1, 1], [0, 0, -1.05]));
      accents.push(placed(cone(1.4, 3.5, 3), [1.25, 2.2, 0.2], [0.4, 1, 1], [0, 0, 1.05]));
    }
  }

  if (spec.theme === "industrial") {
    if (titleHas(spec, "windmill")) {
      structures.push(placed(frustum(1.25, 0.8, 4.8, 8), [0, 2.4, 0]));
      accents.push(placed(box(0.38, 4.3, 0.16), [0, 4.05, 1.05], [1, 1, 1], [0, 0, Math.PI * 0.25]));
      accents.push(placed(box(0.38, 4.3, 0.16), [0, 4.05, 1.05], [1, 1, 1], [0, 0, -Math.PI * 0.25]));
      accents.push(placed(cylinder(0.34, 0.3, 10), [0, 4.05, 1.12], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
    } else if (titleHas(spec, "water-wheel")) {
      structures.push(...cabin(-2, 0, 1.45, 0));
      accents.push(...wheel(1.8, 1.55, 0, 1.55));
    } else if (titleHas(spec, "railroad")) {
      structures.push(...tram(0, 0, 0.8, 4));
      accents.push(...railPair(17));
    } else if (titleHas(spec, "hill-tram")) {
      structures.push(placed(merge(...tram(0, 0, 0.9, 2)), [0, 2.1, 0], [1, 1, 1], [0, 0, 0.28]));
      accents.push(placed(merge(...railPair(15)), [0, 2, 0], [1, 1, 1], [0, 0, 0.28]));
      for (const x of [-5, -2.5, 0, 2.5, 5]) structures.push(placed(box(0.35, 4.2 + x * 0.28, 1.8), [x, 1.8 + x * 0.14, 0]));
    } else if (titleHas(spec, "last-stop")) {
      structures.push(...tram(-1.2, 0, 0.82, 2));
      structures.push(placed(box(8.5, 0.35, 2.4), [0, 0.2, -2]), placed(box(6.8, 0.18, 2.2), [0, 3.4, -2]));
      for (const x of [-3, -1, 1, 3]) structures.push(placed(cylinder(0.12, 3.2, 6), [x, 1.7, -2]));
      accents.push(...railPair(15));
    } else if (titleHas(spec, "scorching-day")) {
      for (let level = 0; level < 4; level++) structures.push(placed(box(13 - level * 1.6, 0.32, 2.4), [0, level * 0.58 + 0.2, level * 0.65]));
      structures.push(...vehicle(2.2, -0.8, 0.8, false));
      accents.push(placed(icosphere(1.15, 2), [-5.4, 6.4, -4.2], [1, 1, 0.3]));
    } else if (titleHas(spec, "tram")) {
      structures.push(...tram(0, 0, 0.88, 3));
      accents.push(...railPair(16));
      for (const [index, x] of [-5.5, 5.5].entries()) {
        structures.push(sceneBuilding({ x, z: 0, width: 2.2, depth: 2.6, floors: 4, height: 4.8, seed: seed + 41 + index, roof: "flat" }));
      }
    } else {
      accents.push(placed(box(0.22, 0.12, 15), [-0.8, 0.04, 0]), placed(box(0.22, 0.12, 15), [0.8, 0.04, 0]));
      for (let index = -7; index <= 7; index++) accents.push(placed(box(2.2, 0.1, 0.18), [0, 0.08, index]));
      structures.push(...vehicle(0, 0, 1.1, false));
    }
  }

  if (["effects", "weather"].includes(spec.theme)) {
    if (!specialArchitecture) structures.push(...cabin(0, 0, 1.1, 0.15));
    for (let index = 0; index < Math.round(6 * density); index++) {
      atmosphere.push(placed(icosphere(1, 1), [rng.range(-6, 6), rng.range(5.5, 7), rng.range(-3, 3)], [rng.range(0.8, 1.7), rng.range(0.45, 0.8), rng.range(0.8, 1.4)]));
    }
    if (titleHas(spec, "fire", "rebirth", "survivor", "failed")) {
      for (let index = 0; index < 9; index++) effects.push(placed(cone(rng.range(0.25, 0.65), rng.range(1.2, 2.8), 6), [rng.range(-2, 2), rng.range(0.6, 1.4), rng.range(-1.5, 1.5)]));
    } else if (titleHas(spec, "alien")) {
      accents.push(placed(icosphere(1.7, 2), [0, 5.2, 0], [1.5, 0.35, 1.5]));
      effects.push(placed(cone(2.8, 5.5, 12), [0, 2.45, 0], [1, 1, 1], [Math.PI, 0, 0]));
    } else {
      for (let index = 0; index < Math.round(24 * density); index++) effects.push(placed(cylinder(0.025, rng.range(0.8, 1.5), 5), [rng.range(-7, 7), rng.range(1, 6), rng.range(-5, 5)], [1, 1, 1], [0, 0, -0.25]));
    }
  }

  if (titleHas(spec, "waterfall")) {
    structures.push(placed(icosphere(1, 1), [-2.1, 2.1, 0], [2.4, 2.6, 2]), placed(icosphere(1, 1), [2.1, 2.1, 0], [2.4, 2.6, 2]));
    effects.push(placed(box(2.3, 4.5, 0.2), [0, 2.3, 0.65]));
    effects.push(placed(icosphere(1, 1), [0, 0.2, 1.1], [2.5, 0.25, 1.8]));
  }

  if (titleHas(spec, "lightning")) {
    effects.push(placed(box(0.18, 2.4, 0.16), [0.6, 5.4, 0], [1, 1, 1], [0, 0, 0.35]));
    effects.push(placed(box(0.18, 2.2, 0.16), [-0.15, 3.5, 0], [1, 1, 1], [0, 0, -0.48]));
    effects.push(placed(box(0.18, 2.1, 0.16), [0.45, 1.75, 0], [1, 1, 1], [0, 0, 0.42]));
  }

  if (spec.theme === "showcase") {
    const showcaseCount = Math.round((5 + spec.page % 5) * density);
    const arc = titleHas(spec, "progress", "remake");
    for (let index = 0; index < showcaseCount; index++) {
      const normalized = showcaseCount === 1 ? 0 : index / (showcaseCount - 1) - 0.5;
      const x = normalized * Math.min(14, showcaseCount * 2.05);
      const z = arc ? Math.abs(normalized) * (2.6 + (spec.page % 7) * 0.16) : (index % 2) * 0.75;
      structures.push(placed(box(1.35, 0.25 + index * 0.065, 1.35), [x, 0.15, z]));
      accents.push(placed(index % 2 === 0 ? icosphere(0.62, 1) : cone(0.68, 1.35, 5 + index % 3), [x, 1 + index * 0.065, z]));
    }
    if (titleHas(spec, "sky-lighting")) {
      atmosphere.push(placed(icosphere(1.2, 2), [-5.2, 6.3, -4], [1, 1, 0.3]));
    } else if (titleHas(spec, "transparent-background")) {
      accents.push(placed(torus(2.4, 0.12, 18, 6), [0, 2.4, 1.2], [1, 1, 1], [Math.PI * 0.5, 0, 0]));
    }
  }

  if (titleHas(spec, "full-moon", "night", "howl")) atmosphere.push(placed(icosphere(1.2, 2), [5.5, 6.5, -5], [1, 1, 0.35]));
  if (titleHas(spec, "pumpkin")) accents.push(placed(icosphere(1.6, 2), [0, 1.2, 0], [1.25, 1, 1]), placed(cone(0.18, 0.7, 6), [0, 2.55, 0]));
  if (titleHas(spec, "cannon")) {
    accents.push(placed(cylinder(0.45, 3.6, 10), [0, 1.6, 0], [1, 1, 1], [0, 0, Math.PI * 0.5]));
    accents.push(...wheel(-0.7, 0.75, -0.7, 0.75), ...wheel(-0.7, 0.75, 0.7, 0.75));
  }
  if (titleHas(spec, "trident")) {
    accents.push(placed(cylinder(0.11, 4.8, 7), [0, 2.4, 0]));
    for (const x of [-0.42, 0, 0.42]) accents.push(placed(cone(0.16, 0.75, 6), [x, 5.05 - Math.abs(x) * 0.4, 0]));
    accents.push(placed(box(1.1, 0.12, 0.12), [0, 4.65, 0]));
  }

  addPart(parts, ground, `${spec.id}_ground`, "场景基底", palette.ground, seed, variation);
  addPart(parts, structures, `${spec.id}_structures`, "主体造型", palette.structure, seed + 1, variation);
  addPart(parts, vegetation, `${spec.id}_vegetation`, "植被群", palette.vegetation, seed + 2, variation);
  addPart(parts, accents, `${spec.id}_accents`, "主题特征件", palette.accent, seed + 3, variation, true);
  const effectColor: LowPolyColor = titleHas(spec, "waterfall", "portal", "summoning", "alien")
    ? [0.26, 0.78, 0.94]
    : titleHas(spec, "lightning")
      ? [0.98, 0.84, 0.18]
      : palette.accent;
  addPart(parts, effects, `${spec.id}_effects`, "动态特效", effectColor, seed + 4, variation * 0.55, true);
  addPart(parts, atmosphere, `${spec.id}_atmosphere`, "天空与气象", palette.sky, seed + 5, variation * 0.55, true);

  if (sceneScale !== 1) {
    return parts.map((part) => ({ ...part, mesh: scaleMesh(part.mesh, vec3(sceneScale, sceneScale, sceneScale)) }));
  }
  return parts;
}
