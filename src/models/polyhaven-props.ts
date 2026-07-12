/**
 * Independent procedural reconstructions from Poly Haven public preview images.
 * Reference metadata and thumbnails are used; source meshes and texture maps are not.
 */
import {
  box,
  capsule,
  cylinder,
  gear,
  lathe,
  merge,
  polyline,
  prism,
  roundedBox,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import {
  buildBoulderMeshes,
  buildBenchViseMeshes,
  buildDeadwoodMeshes,
  buildHandToolMeshes,
  buildHydrantMeshes,
  buildIndustrialPipeMeshes,
  buildMasonryRingMeshes,
  buildRootedStumpMeshes,
  buildRuinedArchMeshes,
  buildSoftBagMeshes,
  buildTimberTableMeshes,
  buildWateringCanMeshes,
  buildWickerBasketMeshes,
  type HandToolKind,
} from "./procedural-prop-generators.js";
import {
  buildPolyHavenPriorityPropMeshes,
  type PolyHavenPriorityPropKind,
} from "./polyhaven-priority-props.js";
import {
  buildPolyHavenRecommendedPropMeshes,
  type PolyHavenRecommendedPropKind,
} from "./polyhaven-recommended-props.js";
import {
  buildPolyHavenTopCandidateMeshes,
  type PolyHavenTopCandidateKind,
} from "./polyhaven-top-candidates.js";
import {
  buildPolyHavenNextPropMeshes,
  type PolyHavenNextPropKind,
} from "./polyhaven-next-props.js";
import {
  buildPolyHavenLearningPropMeshes,
  type PolyHavenLearningPropKind,
} from "./polyhaven-learning-props.js";
import {
  buildPolyHavenFinalLearningPropMeshes,
  type PolyHavenFinalLearningPropKind,
} from "./polyhaven-final-learning-props.js";
import {
  buildPolyHavenDisplayPropMeshes,
  type PolyHavenDisplayPropKind,
} from "./polyhaven-display-props.js";

type RGB = [number, number, number];

export type PolyHavenPropKind =
  | "oil-drum"
  | "wooden-chest"
  | "painted-bench"
  | "shelf"
  | "stone-fire-pit"
  | "fire-hydrant"
  | "tree-stump"
  | "cement-bag"
  | "painted-table"
  | "utility-box"
  | "boombox"
  | "brass-lantern"
  | "flashlight"
  | "adjustable-wrench"
  | "pliers"
  | "screwdriver"
  | "cross-pein-hammer"
  | "hatchet"
  | "industrial-pipes"
  | "ruined-fort-arch"
  | "boulder"
  | "deadwood"
  | "wicker-basket"
  | "watering-can"
  | "bench-vise"
  | "binoculars"
  | "alarm-clock"
  | "megaphone"
  | "oil-can"
  | "hand-drill"
  | "wheelchair"
  | "hose-reel"
  | "drill-press"
  | "multimeter"
  | "portable-generator"
  | PolyHavenPriorityPropKind
  | PolyHavenRecommendedPropKind
  | PolyHavenTopCandidateKind
  | PolyHavenNextPropKind
  | PolyHavenLearningPropKind
  | PolyHavenFinalLearningPropKind
  | PolyHavenDisplayPropKind;

export interface PolyHavenPropParams {
  kind: PolyHavenPropKind;
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface PolyHavenPropDefinition {
  id: string;
  name: string;
  kind: PolyHavenPropKind;
  sourceAssetId: string;
  sourceName: string;
  sourceImage: string;
  sourceDimensionsMm: [number, number, number];
  defaults: PolyHavenPropParams;
}

const SOURCE_SITE = "https://polyhaven.com/models";
const SOURCE_ASSET = "https://polyhaven.com/a";
const SOURCE_THUMB = "https://cdn.polyhaven.com/asset_img/thumbs";

export const POLY_HAVEN_PROP_MODELS: PolyHavenPropDefinition[] = [
  {
    id: "polyhaven-barrel-01",
    name: "Poly Haven 红色油桶复刻",
    kind: "oil-drum",
    sourceAssetId: "Barrel_01",
    sourceName: "Barrel 01",
    sourceImage: `${SOURCE_THUMB}/Barrel_01.png?width=512&height=512`,
    sourceDimensionsMm: [563.035, 563.035, 880],
    defaults: { kind: "oil-drum", width: 0.563, depth: 0.563, height: 0.88, detail: 1, seed: 11, variation: 0, structure: 8, damage: 0 },
  },
  {
    id: "polyhaven-wooden-crate-01",
    name: "Poly Haven 航海木箱复刻",
    kind: "wooden-chest",
    sourceAssetId: "wooden_crate_01",
    sourceName: "Wooden Crate 01",
    sourceImage: `${SOURCE_THUMB}/wooden_crate_01.png?width=512&height=512`,
    sourceDimensionsMm: [825.273, 408.954, 349.618],
    defaults: { kind: "wooden-chest", width: 0.825, depth: 0.409, height: 0.35, detail: 1, seed: 21, variation: 0, structure: 8, damage: 0 },
  },
  {
    id: "polyhaven-painted-wooden-bench",
    name: "Poly Haven 旧漆木长凳复刻",
    kind: "painted-bench",
    sourceAssetId: "painted_wooden_bench",
    sourceName: "Painted Wooden Bench",
    sourceImage: `${SOURCE_THUMB}/painted_wooden_bench.png?width=512&height=512`,
    sourceDimensionsMm: [1164.944, 496.543, 889.291],
    defaults: { kind: "painted-bench", width: 1.165, depth: 0.497, height: 0.889, detail: 1, seed: 31, variation: 0, structure: 8, damage: 0 },
  },
  {
    id: "polyhaven-shelf-01",
    name: "Poly Haven 窄高搁架复刻",
    kind: "shelf",
    sourceAssetId: "Shelf_01",
    sourceName: "Shelf 01",
    sourceImage: `${SOURCE_THUMB}/Shelf_01.png?width=512&height=512`,
    sourceDimensionsMm: [1003.444, 256.98, 2080.31],
    defaults: { kind: "shelf", width: 1.003, depth: 0.257, height: 2.08, detail: 1, seed: 41, variation: 0, structure: 7, damage: 0 },
  },
  {
    id: "polyhaven-stone-fire-pit",
    name: "Poly Haven 石砌火坑复刻",
    kind: "stone-fire-pit",
    sourceAssetId: "stone_fire_pit",
    sourceName: "Stone Fire Pit",
    sourceImage: `${SOURCE_THUMB}/stone_fire_pit.png?width=512&height=512`,
    sourceDimensionsMm: [1448.496, 1433.234, 388.326],
    defaults: { kind: "stone-fire-pit", width: 1.448, depth: 1.433, height: 0.388, detail: 1, seed: 51, variation: 0.82, structure: 12, damage: 0.18 },
  },
  {
    id: "polyhaven-fire-hydrant",
    name: "Poly Haven 消防栓复刻",
    kind: "fire-hydrant",
    sourceAssetId: "fire_hydrant",
    sourceName: "Fire Hydrant",
    sourceImage: `${SOURCE_THUMB}/fire_hydrant.png?width=512&height=512`,
    sourceDimensionsMm: [874.624, 317.744, 799.456],
    defaults: { kind: "fire-hydrant", width: 0.875, depth: 0.318, height: 0.799, detail: 1, seed: 61, variation: 0.25, structure: 6, damage: 0.12 },
  },
  {
    id: "polyhaven-tree-stump-01",
    name: "Poly Haven 林地树桩复刻",
    kind: "tree-stump",
    sourceAssetId: "tree_stump_01",
    sourceName: "Tree Stump 01",
    sourceImage: `${SOURCE_THUMB}/tree_stump_01.png?width=512&height=512`,
    sourceDimensionsMm: [1425.55, 1590.314, 572.668],
    defaults: { kind: "tree-stump", width: 1.426, depth: 1.59, height: 0.573, detail: 1, seed: 71, variation: 0.9, structure: 10, damage: 0.45 },
  },
  {
    id: "polyhaven-cement-bag",
    name: "Poly Haven 水泥袋复刻",
    kind: "cement-bag",
    sourceAssetId: "cement_bag",
    sourceName: "Cement Bag",
    sourceImage: `${SOURCE_THUMB}/cement_bag.png?width=512&height=512`,
    sourceDimensionsMm: [462.474, 699.584, 179.91],
    defaults: { kind: "cement-bag", width: 0.462, depth: 0.7, height: 0.18, detail: 1, seed: 81, variation: 0.72, structure: 7, damage: 0 },
  },
  {
    id: "polyhaven-painted-wooden-table",
    name: "Poly Haven 旧漆木桌复刻",
    kind: "painted-table",
    sourceAssetId: "painted_wooden_table",
    sourceName: "Painted Wooden Table",
    sourceImage: `${SOURCE_THUMB}/painted_wooden_table.png?width=512&height=512`,
    sourceDimensionsMm: [2405.604, 1136.984, 958.637],
    defaults: { kind: "painted-table", width: 2.406, depth: 1.137, height: 0.959, detail: 1, seed: 91, variation: 0.35, structure: 7, damage: 0.28 },
  },
  {
    id: "polyhaven-utility-box-01",
    name: "Poly Haven 户外配电箱复刻",
    kind: "utility-box",
    sourceAssetId: "utility_box_01",
    sourceName: "Utility Box 01",
    sourceImage: `${SOURCE_THUMB}/utility_box_01.png?width=512&height=512`,
    sourceDimensionsMm: [520, 432, 1120.333],
    defaults: { kind: "utility-box", width: 0.52, depth: 0.432, height: 1.12, detail: 1, seed: 101, variation: 0.25, structure: 8, damage: 0.2 },
  },
  {
    id: "polyhaven-boombox",
    name: "Poly Haven 复古收录机复刻",
    kind: "boombox",
    sourceAssetId: "boombox",
    sourceName: "Boombox",
    sourceImage: `${SOURCE_THUMB}/boombox.png?width=512&height=512`,
    sourceDimensionsMm: [723.78, 186.465, 470.101],
    defaults: { kind: "boombox", width: 0.724, depth: 0.186, height: 0.47, detail: 1, seed: 111, variation: 0.2, structure: 8, damage: 0.1 },
  },
  {
    id: "polyhaven-brass-diya-lantern",
    name: "Poly Haven 黄铜灯笼复刻",
    kind: "brass-lantern",
    sourceAssetId: "brass_diya_lantern",
    sourceName: "Brass Diya Lantern",
    sourceImage: `${SOURCE_THUMB}/brass_diya_lantern.png?width=512&height=512`,
    sourceDimensionsMm: [123.005, 123.005, 380.824],
    defaults: { kind: "brass-lantern", width: 0.123, depth: 0.123, height: 0.381, detail: 1, seed: 121, variation: 0.15, structure: 6, damage: 0.12 },
  },
  {
    id: "polyhaven-pastic-torch-6v",
    name: "Poly Haven 6V 手提探照灯复刻",
    kind: "flashlight",
    sourceAssetId: "pastic_torch_6v",
    sourceName: "Pastic Torch 6v",
    sourceImage: `${SOURCE_THUMB}/pastic_torch_6v.png?width=512&height=512`,
    sourceDimensionsMm: [136.92, 224.218, 141.71],
    defaults: { kind: "flashlight", width: 0.137, depth: 0.224, height: 0.142, detail: 1, seed: 126, variation: 0.12, structure: 9, damage: 0.1 },
  },
  {
    id: "polyhaven-adjustable-wrench",
    name: "Poly Haven 活动扳手复刻",
    kind: "adjustable-wrench",
    sourceAssetId: "adjustable_wrench",
    sourceName: "Adjustable Wrench",
    sourceImage: `${SOURCE_THUMB}/adjustable_wrench.png?width=512&height=512`,
    sourceDimensionsMm: [68.344, 30.59, 254.13],
    defaults: { kind: "adjustable-wrench", width: 0.068, depth: 0.031, height: 0.254, detail: 1, seed: 127, variation: 0.15, structure: 6, damage: 0.12 },
  },
  {
    id: "polyhaven-pliers",
    name: "Poly Haven 钳子复刻",
    kind: "pliers",
    sourceAssetId: "pliers",
    sourceName: "Pliers",
    sourceImage: `${SOURCE_THUMB}/pliers.png?width=512&height=512`,
    sourceDimensionsMm: [55.29, 17.985, 179.783],
    defaults: { kind: "pliers", width: 0.055, depth: 0.018, height: 0.18, detail: 1, seed: 128, variation: 0.12, structure: 6, damage: 0.08 },
  },
  {
    id: "polyhaven-flathead-screwdriver",
    name: "Poly Haven 一字螺丝刀复刻",
    kind: "screwdriver",
    sourceAssetId: "flathead_screwdriver",
    sourceName: "Flathead Screwdriver",
    sourceImage: `${SOURCE_THUMB}/flathead_screwdriver.png?width=512&height=512`,
    sourceDimensionsMm: [30.03, 30.03, 261.294],
    defaults: { kind: "screwdriver", width: 0.03, depth: 0.03, height: 0.261, detail: 1, seed: 129, variation: 0.1, structure: 6, damage: 0.06 },
  },
  {
    id: "polyhaven-cross-pein-hammer",
    name: "Poly Haven 横口锤复刻",
    kind: "cross-pein-hammer",
    sourceAssetId: "cross_pein_hammer",
    sourceName: "Cross Pein Hammer",
    sourceImage: `${SOURCE_THUMB}/cross_pein_hammer.png?width=512&height=512`,
    sourceDimensionsMm: [99.072, 24.276, 300.25],
    defaults: { kind: "cross-pein-hammer", width: 0.099, depth: 0.024, height: 0.3, detail: 1, seed: 130, variation: 0.16, structure: 6, damage: 0.18 },
  },
  {
    id: "polyhaven-hatchet",
    name: "Poly Haven 短柄斧复刻",
    kind: "hatchet",
    sourceAssetId: "hatchet",
    sourceName: "Hatchet",
    sourceImage: `${SOURCE_THUMB}/hatchet.png?width=512&height=512`,
    sourceDimensionsMm: [26.022, 104.27, 288.729],
    defaults: { kind: "hatchet", width: 0.104, depth: 0.026, height: 0.289, detail: 1, seed: 131, variation: 0.18, structure: 6, damage: 0.2 },
  },
  {
    id: "polyhaven-industrial-pipes-01",
    name: "Poly Haven 模块化工业管道复刻",
    kind: "industrial-pipes",
    sourceAssetId: "modular_industrial_pipes_01",
    sourceName: "Modular Industrial Pipes 01",
    sourceImage: `${SOURCE_THUMB}/modular_industrial_pipes_01.png?width=512&height=512`,
    sourceDimensionsMm: [1402.802, 307.596, 1954.64],
    defaults: { kind: "industrial-pipes", width: 1.403, depth: 0.308, height: 1.955, detail: 1, seed: 131, variation: 0.2, structure: 12, damage: 0.35 },
  },
  {
    id: "polyhaven-modular-fort-arch",
    name: "Poly Haven 模块化城堡残拱复刻",
    kind: "ruined-fort-arch",
    sourceAssetId: "modular_fort_01",
    sourceName: "Modular Fort 01",
    sourceImage: `${SOURCE_THUMB}/modular_fort_01.png?width=512&height=512`,
    sourceDimensionsMm: [71375.298, 42669.876, 13672.093],
    defaults: { kind: "ruined-fort-arch", width: 4.2, depth: 1.4, height: 3.3, detail: 1, seed: 141, variation: 0.72, structure: 12, damage: 0.62 },
  },
  {
    id: "polyhaven-boulder-01",
    name: "Poly Haven 风化巨石复刻",
    kind: "boulder",
    sourceAssetId: "boulder_01",
    sourceName: "Boulder 01",
    sourceImage: `${SOURCE_THUMB}/boulder_01.png?width=512&height=512`,
    sourceDimensionsMm: [1272.683, 1830.734, 1003.892],
    defaults: { kind: "boulder", width: 1.273, depth: 1.831, height: 1.004, detail: 1, seed: 151, variation: 0.78, structure: 9, damage: 0.68 },
  },
  {
    id: "polyhaven-dead-tree-trunk-02",
    name: "Poly Haven 倒伏枯木复刻",
    kind: "deadwood",
    sourceAssetId: "dead_tree_trunk_02",
    sourceName: "Dead Tree Trunk 02",
    sourceImage: `${SOURCE_THUMB}/dead_tree_trunk_02.png?width=512&height=512`,
    sourceDimensionsMm: [4053.72, 1056.61, 1055.472],
    defaults: { kind: "deadwood", width: 4.054, depth: 1.057, height: 1.055, detail: 1, seed: 161, variation: 0.82, structure: 10, damage: 0.76 },
  },
  {
    id: "polyhaven-wicker-basket-01",
    name: "Poly Haven 柳条编织篮复刻",
    kind: "wicker-basket",
    sourceAssetId: "wicker_basket_01",
    sourceName: "Wicker Basket 01",
    sourceImage: `${SOURCE_THUMB}/wicker_basket_01.png?width=512&height=512`,
    sourceDimensionsMm: [383.224, 295.015, 117.423],
    defaults: { kind: "wicker-basket", width: 0.383, depth: 0.295, height: 0.117, detail: 1, seed: 171, variation: 0.42, structure: 18, damage: 0.12 },
  },
  {
    id: "polyhaven-watering-can-metal-01",
    name: "Poly Haven 金属浇水壶复刻",
    kind: "watering-can",
    sourceAssetId: "watering_can_metal_01",
    sourceName: "Watering Can Metal 01",
    sourceImage: `${SOURCE_THUMB}/watering_can_metal_01.png?width=512&height=512`,
    sourceDimensionsMm: [191.019, 452.336, 196.819],
    defaults: { kind: "watering-can", width: 0.191, depth: 0.452, height: 0.197, detail: 1, seed: 181, variation: 0.24, structure: 14, damage: 0.36 },
  },
  {
    id: "polyhaven-bench-vice-01",
    name: "Poly Haven 工作台钳复刻",
    kind: "bench-vise",
    sourceAssetId: "bench_vice_01",
    sourceName: "Bench Vice 01",
    sourceImage: `${SOURCE_THUMB}/bench_vice_01.png?width=512&height=512`,
    sourceDimensionsMm: [200.482, 395.787, 271.678],
    defaults: { kind: "bench-vise", width: 0.2, depth: 0.396, height: 0.272, detail: 1, seed: 191, variation: 0.48, structure: 12, damage: 0.42 },
  },
  {
    id: "polyhaven-vintage-binocular",
    name: "Poly Haven 复古双筒望远镜复刻",
    kind: "binoculars",
    sourceAssetId: "vintage_binocular",
    sourceName: "Vintage Binoculars",
    sourceImage: `${SOURCE_THUMB}/vintage_binocular.png?width=512&height=512`,
    sourceDimensionsMm: [193.997, 199.235, 68.443],
    defaults: { kind: "binoculars", width: 0.194, depth: 0.199, height: 0.068, detail: 1, seed: 201, variation: 0.16, structure: 8, damage: 0.14 },
  },
  {
    id: "polyhaven-alarm-clock-01",
    name: "Poly Haven 复古双铃闹钟复刻",
    kind: "alarm-clock",
    sourceAssetId: "alarm_clock_01",
    sourceName: "Alarm Clock 01",
    sourceImage: `${SOURCE_THUMB}/alarm_clock_01.png?width=512&height=512`,
    sourceDimensionsMm: [227.715, 168.42, 174.155],
    defaults: { kind: "alarm-clock", width: 0.228, depth: 0.168, height: 0.174, detail: 1, seed: 211, variation: 0.12, structure: 12, damage: 0.12 },
  },
  {
    id: "polyhaven-megaphone-01",
    name: "Poly Haven 手持扩音器复刻",
    kind: "megaphone",
    sourceAssetId: "Megaphone_01",
    sourceName: "Megaphone 01",
    sourceImage: `${SOURCE_THUMB}/Megaphone_01.png?width=512&height=512`,
    sourceDimensionsMm: [370.666, 228.454, 300.078],
    defaults: { kind: "megaphone", width: 0.371, depth: 0.228, height: 0.3, detail: 1, seed: 221, variation: 0.12, structure: 8, damage: 0.1 },
  },
  {
    id: "polyhaven-small-oil-can-01",
    name: "Poly Haven 小型手压油壶复刻",
    kind: "oil-can",
    sourceAssetId: "small_oil_can_01",
    sourceName: "Small Oil Can 01",
    sourceImage: `${SOURCE_THUMB}/small_oil_can_01.png?width=512&height=512`,
    sourceDimensionsMm: [266.094, 103.849, 236.793],
    defaults: { kind: "oil-can", width: 0.266, depth: 0.104, height: 0.237, detail: 1, seed: 231, variation: 0.14, structure: 8, damage: 0.28 },
  },
  {
    id: "polyhaven-vintage-hand-drill",
    name: "Poly Haven 复古手摇钻复刻",
    kind: "hand-drill",
    sourceAssetId: "vintage_hand_drill",
    sourceName: "Vintage Hand Drill",
    sourceImage: `${SOURCE_THUMB}/vintage_hand_drill.png?width=512&height=512`,
    sourceDimensionsMm: [123.887, 138.806, 485.684],
    defaults: { kind: "hand-drill", width: 0.124, depth: 0.139, height: 0.486, detail: 1, seed: 241, variation: 0.18, structure: 24, damage: 0.3 },
  },
  {
    id: "polyhaven-wheelchair-01",
    name: "Poly Haven 折叠轮椅复刻",
    kind: "wheelchair",
    sourceAssetId: "wheelchair_01",
    sourceName: "Wheelchair 01",
    sourceImage: `${SOURCE_THUMB}/wheelchair_01.png?width=512&height=512`,
    sourceDimensionsMm: [824.091, 1090.867, 1103.502],
    defaults: { kind: "wheelchair", width: 0.824, depth: 1.091, height: 1.104, detail: 1, seed: 251, variation: 0.18, structure: 20, damage: 0.08 },
  },
  {
    id: "polyhaven-garden-hose-wall-mounted-01",
    name: "Poly Haven 壁挂花园水管卷盘复刻",
    kind: "hose-reel",
    sourceAssetId: "garden_hose_wall_mounted_01",
    sourceName: "Garden Hose Wall Mounted 01",
    sourceImage: `${SOURCE_THUMB}/garden_hose_wall_mounted_01.png?width=512&height=512`,
    sourceDimensionsMm: [466.728, 250.309, 557.002],
    defaults: { kind: "hose-reel", width: 0.467, depth: 0.25, height: 0.557, detail: 1, seed: 261, variation: 0.22, structure: 20, damage: 0.12 },
  },
  {
    id: "polyhaven-drill-press-01",
    name: "Poly Haven 台式钻床复刻",
    kind: "drill-press",
    sourceAssetId: "drill_press_01",
    sourceName: "Drill Press 01",
    sourceImage: `${SOURCE_THUMB}/drill_press_01.png?width=512&height=512`,
    sourceDimensionsMm: [365.863, 598.785, 901.565],
    defaults: { kind: "drill-press", width: 0.366, depth: 0.599, height: 0.902, detail: 1, seed: 271, variation: 0.42, structure: 12, damage: 0.18 },
  },
  {
    id: "polyhaven-retro-multimeter",
    name: "Poly Haven 复古指针万用表复刻",
    kind: "multimeter",
    sourceAssetId: "retro_multimeter",
    sourceName: "Retro Multimeter",
    sourceImage: `${SOURCE_THUMB}/retro_multimeter.png?width=512&height=512`,
    sourceDimensionsMm: [215.974, 202.642, 278.638],
    defaults: { kind: "multimeter", width: 0.216, depth: 0.203, height: 0.279, detail: 1, seed: 281, variation: 0.36, structure: 18, damage: 0.08 },
  },
  {
    id: "polyhaven-portable-generator",
    name: "Poly Haven 便携汽油发电机复刻",
    kind: "portable-generator",
    sourceAssetId: "portable_generator",
    sourceName: "Portable Generator",
    sourceImage: `${SOURCE_THUMB}/portable_generator.png?width=512&height=512`,
    sourceDimensionsMm: [818.341, 564, 576.923],
    defaults: { kind: "portable-generator", width: 0.818, depth: 0.564, height: 0.577, detail: 1, seed: 291, variation: 0.2, structure: 12, damage: 0.24 },
  },
  {
    id: "polyhaven-modular-airduct-rectangular-01",
    name: "Poly Haven 模块化矩形风管复刻",
    kind: "rectangular-airduct-kit",
    sourceAssetId: "modular_airduct_rectangular_01",
    sourceName: "Modular Airduct Rectangular 01",
    sourceImage: `${SOURCE_THUMB}/modular_airduct_rectangular_01.png?width=512&height=512`,
    sourceDimensionsMm: [7663.504, 2586.645, 1256.151],
    defaults: { kind: "rectangular-airduct-kit", width: 7.664, depth: 2.587, height: 1.256, detail: 1, seed: 301, variation: 0.28, structure: 16, damage: 0.32 },
  },
  {
    id: "polyhaven-portable-welding-cart",
    name: "Poly Haven 便携焊接车复刻",
    kind: "welding-cart",
    sourceAssetId: "portable_welding_cart",
    sourceName: "Portable Welding Cart",
    sourceImage: `${SOURCE_THUMB}/portable_welding_cart.png?width=512&height=512`,
    sourceDimensionsMm: [838.288, 654.904, 1563.17],
    defaults: { kind: "welding-cart", width: 0.838, depth: 0.655, height: 1.563, detail: 1, seed: 311, variation: 0.42, structure: 12, damage: 0.38 },
  },
  {
    id: "polyhaven-filmstrip-projector-8mm",
    name: "Poly Haven 8 毫米胶片放映机复刻",
    kind: "film-projector",
    sourceAssetId: "filmstrip_projector_8mm",
    sourceName: "Filmstrip Projector 8mm",
    sourceImage: `${SOURCE_THUMB}/filmstrip_projector_8mm.png?width=512&height=512`,
    sourceDimensionsMm: [253.679, 602.619, 345.408],
    defaults: { kind: "film-projector", width: 0.254, depth: 0.603, height: 0.345, detail: 1, seed: 321, variation: 0.38, structure: 14, damage: 0.2 },
  },
  {
    id: "polyhaven-industrial-microscope",
    name: "Poly Haven 工业显微镜复刻",
    kind: "industrial-microscope",
    sourceAssetId: "industrial_microscope",
    sourceName: "Industrial Microscope",
    sourceImage: `${SOURCE_THUMB}/industrial_microscope.png?width=512&height=512`,
    sourceDimensionsMm: [214.535, 498.091, 461.744],
    defaults: { kind: "industrial-microscope", width: 0.215, depth: 0.498, height: 0.462, detail: 1, seed: 331, variation: 0.46, structure: 12, damage: 0.12 },
  },
  {
    id: "polyhaven-cash-register-01",
    name: "Poly Haven 老式收银机复刻",
    kind: "cash-register",
    sourceAssetId: "CashRegister_01",
    sourceName: "Cash Register 01",
    sourceImage: `${SOURCE_THUMB}/CashRegister_01.png?width=512&height=512`,
    sourceDimensionsMm: [600.491, 624.205, 621.356],
    defaults: { kind: "cash-register", width: 0.6, depth: 0.624, height: 0.621, detail: 1, seed: 341, variation: 0.62, structure: 16, damage: 0.26 },
  },
  {
    id: "polyhaven-overhead-crane",
    name: "Poly Haven 桥式起重机复刻",
    kind: "overhead-crane",
    sourceAssetId: "overhead_crane",
    sourceName: "Overhead Crane",
    sourceImage: `${SOURCE_THUMB}/overhead_crane.png?width=512&height=512`,
    sourceDimensionsMm: [12491.66, 4000, 5132.581],
    defaults: { kind: "overhead-crane", width: 5, depth: 2.4, height: 3.2, detail: 1, seed: 351, variation: 0.5, structure: 12, damage: 0.16 },
  },
  {
    id: "polyhaven-vintage-microscope",
    name: "Poly Haven 古董显微镜复刻",
    kind: "vintage-microscope",
    sourceAssetId: "vintage_microscope",
    sourceName: "Vintage Microscope",
    sourceImage: `${SOURCE_THUMB}/vintage_microscope.png?width=512&height=512`,
    sourceDimensionsMm: [106.799, 181.875, 399.553],
    defaults: { kind: "vintage-microscope", width: 0.107, depth: 0.182, height: 0.4, detail: 1, seed: 361, variation: 0.44, structure: 10, damage: 0.18 },
  },
  {
    id: "polyhaven-modular-electricity-poles",
    name: "Poly Haven 模块化输电杆复刻",
    kind: "power-pole-system",
    sourceAssetId: "modular_electricity_poles",
    sourceName: "Modular Electricity Poles",
    sourceImage: `${SOURCE_THUMB}/modular_electricity_poles.png?width=512&height=512`,
    sourceDimensionsMm: [13119.138, 1957.271, 7000],
    defaults: { kind: "power-pole-system", width: 5, depth: 1.8, height: 4.8, detail: 1, seed: 371, variation: 0.32, structure: 12, damage: 0.22 },
  },
  {
    id: "polyhaven-spinning-wheel-01",
    name: "Poly Haven 老式纺车复刻",
    kind: "spinning-wheel",
    sourceAssetId: "spinning_wheel_01",
    sourceName: "Spinning Wheel 01",
    sourceImage: `${SOURCE_THUMB}/spinning_wheel_01.png?width=512&height=512`,
    sourceDimensionsMm: [489.4, 1024.857, 966.221],
    defaults: { kind: "spinning-wheel", width: 0.489, depth: 1.025, height: 0.966, detail: 1, seed: 381, variation: 0.46, structure: 14, damage: 0.18 },
  },
  {
    id: "polyhaven-exterior-aircon-unit",
    name: "Poly Haven 空调外机组复刻",
    kind: "aircon-unit",
    sourceAssetId: "exterior_aircon_unit",
    sourceName: "Exterior Aircon Unit",
    sourceImage: `${SOURCE_THUMB}/exterior_aircon_unit.png?width=512&height=512`,
    sourceDimensionsMm: [1799.971, 374.159, 927.897],
    defaults: { kind: "aircon-unit", width: 1.8, depth: 0.374, height: 0.928, detail: 1, seed: 391, variation: 0.18, structure: 18, damage: 0.2 },
  },
  {
    id: "polyhaven-hand-plane-no4",
    name: "Poly Haven 4 号手刨复刻",
    kind: "hand-plane",
    sourceAssetId: "hand_plane_no4",
    sourceName: "Hand Plane No4",
    sourceImage: `${SOURCE_THUMB}/hand_plane_no4.png?width=512&height=512`,
    sourceDimensionsMm: [330.798, 84.318, 197.803],
    defaults: { kind: "hand-plane", width: 0.331, depth: 0.084, height: 0.198, detail: 1, seed: 401, variation: 0.38, structure: 10, damage: 0.16 },
  },
  {
    id: "polyhaven-modular-airduct-circular-01",
    name: "Poly Haven 模块化圆形风管复刻",
    kind: "circular-airduct-kit",
    sourceAssetId: "modular_airduct_circular_01",
    sourceName: "Modular Airduct Circular 01",
    sourceImage: `${SOURCE_THUMB}/modular_airduct_circular_01.png?width=512&height=512`,
    sourceDimensionsMm: [4170.706, 1463.481, 1324.144],
    defaults: { kind: "circular-airduct-kit", width: 4.171, depth: 1.463, height: 1.324, detail: 1, seed: 411, variation: 0.24, structure: 16, damage: 0.34 },
  },
  {
    id: "polyhaven-modular-electric-cables",
    name: "Poly Haven 模块化工业电缆复刻",
    kind: "electric-cable-kit",
    sourceAssetId: "modular_electric_cables",
    sourceName: "Modular Electric Cables",
    sourceImage: `${SOURCE_THUMB}/modular_electric_cables.png?width=512&height=512`,
    sourceDimensionsMm: [2076.633, 214.504, 757.252],
    defaults: { kind: "electric-cable-kit", width: 2.077, depth: 0.215, height: 0.757, detail: 1, seed: 421, variation: 0.46, structure: 16, damage: 0.22 },
  },
  {
    id: "polyhaven-desk-lamp-arm-01",
    name: "Poly Haven 工业关节台灯复刻",
    kind: "articulated-desk-lamp",
    sourceAssetId: "desk_lamp_arm_01",
    sourceName: "Desk Lamp Arm 01",
    sourceImage: `${SOURCE_THUMB}/desk_lamp_arm_01.png?width=512&height=512`,
    sourceDimensionsMm: [617.309, 408.023, 879.019],
    defaults: { kind: "articulated-desk-lamp", width: 0.617, depth: 0.408, height: 0.879, detail: 1, seed: 431, variation: 0.36, structure: 12, damage: 0.18 },
  },
  {
    id: "polyhaven-gamepad",
    name: "Poly Haven 复古有线游戏手柄复刻",
    kind: "gamepad",
    sourceAssetId: "gamepad",
    sourceName: "Gamepad",
    sourceImage: `${SOURCE_THUMB}/gamepad.png?width=512&height=512`,
    sourceDimensionsMm: [404.052, 434.961, 18.924],
    defaults: { kind: "gamepad", width: 0.404, depth: 0.435, height: 0.019, detail: 1, seed: 441, variation: 0.56, structure: 10, damage: 0.12 },
  },
  {
    id: "polyhaven-vintage-grandfather-clock-01",
    name: "Poly Haven 老式座钟复刻",
    kind: "grandfather-clock",
    sourceAssetId: "vintage_grandfather_clock_01",
    sourceName: "Vintage Grandfather Clock 01",
    sourceImage: `${SOURCE_THUMB}/vintage_grandfather_clock_01.png?width=512&height=512`,
    sourceDimensionsMm: [996.637, 795.214, 2190.592],
    defaults: { kind: "grandfather-clock", width: 0.997, depth: 0.795, height: 2.191, detail: 1, seed: 451, variation: 0.38, structure: 12, damage: 0.2 },
  },
  {
    id: "polyhaven-drill-01",
    name: "Poly Haven 无绳电钻复刻",
    kind: "cordless-drill",
    sourceAssetId: "Drill_01",
    sourceName: "Drill 01",
    sourceImage: `${SOURCE_THUMB}/Drill_01.png?width=512&height=512`,
    sourceDimensionsMm: [182.88, 52.415, 185.062],
    defaults: { kind: "cordless-drill", width: 0.183, depth: 0.052, height: 0.185, detail: 1, seed: 461, variation: 0.32, structure: 12, damage: 0.08 },
  },
  {
    id: "polyhaven-security-camera-01",
    name: "Poly Haven 户外监控摄像机复刻",
    kind: "security-camera",
    sourceAssetId: "security_camera_01",
    sourceName: "Security Camera 01",
    sourceImage: `${SOURCE_THUMB}/security_camera_01.png?width=512&height=512`,
    sourceDimensionsMm: [169.552, 553.673, 286.047],
    defaults: { kind: "security-camera", width: 0.17, depth: 0.554, height: 0.286, detail: 1, seed: 471, variation: 0.44, structure: 10, damage: 0.16 },
  },
  {
    id: "polyhaven-metal-tool-chest",
    name: "Poly Haven 红色金属工具柜复刻",
    kind: "metal-tool-chest",
    sourceAssetId: "metal_tool_chest",
    sourceName: "Metal Tool Chest",
    sourceImage: `${SOURCE_THUMB}/metal_tool_chest.png?width=512&height=512`,
    sourceDimensionsMm: [685.388, 407.153, 651.836],
    defaults: { kind: "metal-tool-chest", width: 0.685, depth: 0.407, height: 0.652, detail: 1, seed: 481, variation: 0.54, structure: 14, damage: 0.34 },
  },
  {
    id: "polyhaven-modular-fire-escape",
    name: "Poly Haven 模块化消防梯复刻",
    kind: "modular-fire-escape",
    sourceAssetId: "modular_fire_escape",
    sourceName: "Modular Fire Escape",
    sourceImage: `${SOURCE_THUMB}/modular_fire_escape.png?width=512&height=512`,
    sourceDimensionsMm: [6661.2, 1420.765, 9756.551],
    defaults: { kind: "modular-fire-escape", width: 6.661, depth: 1.421, height: 6, detail: 1, seed: 491, variation: 0.28, structure: 15, damage: 0.3 },
  },
  {
    id: "polyhaven-camera-01",
    name: "Poly Haven 复古旁轴相机复刻",
    kind: "rangefinder-camera",
    sourceAssetId: "Camera_01",
    sourceName: "Camera 01",
    sourceImage: `${SOURCE_THUMB}/Camera_01.png?width=512&height=512`,
    sourceDimensionsMm: [213.902, 262.824, 77.847],
    defaults: { kind: "rangefinder-camera", width: 0.263, depth: 0.078, height: 0.214, detail: 1, seed: 531, variation: 0.38, structure: 10, damage: 0.18 },
  },
  {
    id: "polyhaven-modular-wooden-pier",
    name: "Poly Haven 模块化木码头复刻",
    kind: "modular-wooden-pier",
    sourceAssetId: "modular_wooden_pier",
    sourceName: "Modular Wooden Pier",
    sourceImage: `${SOURCE_THUMB}/modular_wooden_pier.png?width=512&height=512`,
    sourceDimensionsMm: [3101.563, 19026.371, 7515.677],
    defaults: { kind: "modular-wooden-pier", width: 3.102, depth: 5, height: 2.8, detail: 1, seed: 541, variation: 0.52, structure: 18, damage: 0.44 },
  },
  {
    id: "polyhaven-modular-chainlink-fence",
    name: "Poly Haven 模块化铁丝网围栏复刻",
    kind: "modular-chainlink-fence",
    sourceAssetId: "modular_chainlink_fence",
    sourceName: "Modular Chainlink Fence",
    sourceImage: `${SOURCE_THUMB}/modular_chainlink_fence.png?width=512&height=512`,
    sourceDimensionsMm: [8115.002, 2149.153, 2522.913],
    defaults: { kind: "modular-chainlink-fence", width: 8.115, depth: 0.18, height: 2.523, detail: 1, seed: 551, variation: 0.24, structure: 16, damage: 0.32 },
  },
  {
    id: "polyhaven-korean-public-payphone-01",
    name: "Poly Haven 韩式公共电话复刻",
    kind: "public-payphone",
    sourceAssetId: "korean_public_payphone_01",
    sourceName: "Korean Public Payphone 01",
    sourceImage: `${SOURCE_THUMB}/korean_public_payphone_01.png?width=512&height=512`,
    sourceDimensionsMm: [400.57, 301.216, 739.733],
    defaults: { kind: "public-payphone", width: 0.401, depth: 0.301, height: 0.74, detail: 1, seed: 501, variation: 0.38, structure: 16, damage: 0.34 },
  },
  {
    id: "polyhaven-ceiling-fan",
    name: "Poly Haven 黑色吊扇复刻",
    kind: "ceiling-fan",
    sourceAssetId: "ceiling_fan",
    sourceName: "Ceiling Fan",
    sourceImage: `${SOURCE_THUMB}/ceiling_fan.png?width=512&height=512`,
    sourceDimensionsMm: [1462.917, 1462.917, 516.343],
    defaults: { kind: "ceiling-fan", width: 1.463, depth: 1.463, height: 0.516, detail: 1, seed: 511, variation: 0.22, structure: 16, damage: 0.04 },
  },
  {
    id: "polyhaven-classic-laptop",
    name: "Poly Haven 经典笔记本电脑复刻",
    kind: "classic-laptop",
    sourceAssetId: "classic_laptop",
    sourceName: "Classic Laptop",
    sourceImage: `${SOURCE_THUMB}/classic_laptop.png?width=512&height=512`,
    sourceDimensionsMm: [651.935, 485.942, 542.811],
    defaults: { kind: "classic-laptop", width: 0.652, depth: 0.486, height: 0.543, detail: 1, seed: 521, variation: 0.56, structure: 18, damage: 0.1 },
  },
  {
    id: "polyhaven-modular-factory-facade",
    name: "Poly Haven 模块化工厂立面复刻",
    kind: "factory-facade-kit",
    sourceAssetId: "modular_factory_facade",
    sourceName: "Modular Factory Facade",
    sourceImage: `${SOURCE_THUMB}/modular_factory_facade.png?width=512&height=512`,
    sourceDimensionsMm: [53329.998, 5356.25, 29000],
    defaults: { kind: "factory-facade-kit", width: 9.2, depth: 1.4, height: 5.8, detail: 1, seed: 561, variation: 0.42, structure: 16, damage: 0.32 },
  },
  {
    id: "polyhaven-modular-urban-apartments-facade",
    name: "Poly Haven 模块化城市公寓立面复刻",
    kind: "apartment-facade-kit",
    sourceAssetId: "modular_urban_apartments_facade",
    sourceName: "Modular Urban Apartments Facade",
    sourceImage: `${SOURCE_THUMB}/modular_urban_apartments_facade.png?width=512&height=512`,
    sourceDimensionsMm: [51529.997, 6665, 17000],
    defaults: { kind: "apartment-facade-kit", width: 9, depth: 1.5, height: 5.8, detail: 1, seed: 571, variation: 0.56, structure: 18, damage: 0.12 },
  },
  {
    id: "polyhaven-cassette-player",
    name: "Poly Haven 便携卡带录音机复刻",
    kind: "cassette-player",
    sourceAssetId: "cassette_player",
    sourceName: "Cassette Player",
    sourceImage: `${SOURCE_THUMB}/cassette_player.png?width=512&height=512`,
    sourceDimensionsMm: [129.46, 48.88, 236.818],
    defaults: { kind: "cassette-player", width: 0.129, depth: 0.049, height: 0.237, detail: 1, seed: 581, variation: 0.34, structure: 16, damage: 0.28 },
  },
  {
    id: "polyhaven-hand-truck",
    name: "Poly Haven 红色仓储手推车复刻",
    kind: "hand-truck",
    sourceAssetId: "hand_truck",
    sourceName: "Hand Truck",
    sourceImage: `${SOURCE_THUMB}/hand_truck.png?width=512&height=512`,
    sourceDimensionsMm: [593.253, 692.527, 1402.513],
    defaults: { kind: "hand-truck", width: 0.593, depth: 0.693, height: 1.403, detail: 1, seed: 591, variation: 0.48, structure: 14, damage: 0.42 },
  },
  {
    id: "polyhaven-korean-fire-extinguisher-01",
    name: "Poly Haven 韩式落地灭火器复刻",
    kind: "fire-extinguisher",
    sourceAssetId: "korean_fire_extinguisher_01",
    sourceName: "Korean Fire Extinguisher 01",
    sourceImage: `${SOURCE_THUMB}/korean_fire_extinguisher_01.png?width=512&height=512`,
    sourceDimensionsMm: [279.958, 367.443, 659.251],
    defaults: { kind: "fire-extinguisher", width: 0.28, depth: 0.367, height: 0.659, detail: 1, seed: 601, variation: 0.36, structure: 12, damage: 0.3 },
  },
  {
    id: "polyhaven-dartboard",
    name: "Poly Haven 传统飞镖盘复刻",
    kind: "dartboard",
    sourceAssetId: "dartboard",
    sourceName: "Dartboard",
    sourceImage: `${SOURCE_THUMB}/dartboard.png?width=512&height=512`,
    sourceDimensionsMm: [450.696, 39.779, 450.696],
    defaults: { kind: "dartboard", width: 0.451, depth: 0.04, height: 0.451, detail: 1, seed: 611, variation: 0.08, structure: 20, damage: 0.26 },
  },
  {
    id: "polyhaven-rollershutter-door",
    name: "Poly Haven 工业卷帘门复刻",
    kind: "roller-shutter",
    sourceAssetId: "rollershutter_door",
    sourceName: "Rollershutter Door",
    sourceImage: `${SOURCE_THUMB}/rollershutter_door.png?width=512&height=512`,
    sourceDimensionsMm: [3080, 300.086, 2399.973],
    defaults: { kind: "roller-shutter", width: 3.08, depth: 0.3, height: 2.4, detail: 1, seed: 621, variation: 0.18, structure: 20, damage: 0.18 },
  },
  {
    id: "polyhaven-old-military-compressor",
    name: "Poly Haven 老式军用压缩机复刻",
    kind: "military-compressor",
    sourceAssetId: "old_military_compressor",
    sourceName: "Old Military Compressor",
    sourceImage: `${SOURCE_THUMB}/old_military_compressor.png?width=512&height=512`,
    sourceDimensionsMm: [598.283, 1675.544, 1179.086],
    defaults: { kind: "military-compressor", width: 0.598, depth: 1.676, height: 1.179, detail: 1, seed: 631, variation: 0.32, structure: 14, damage: 0.46 },
  },
  {
    id: "polyhaven-ladder-sectioned-01",
    name: "Poly Haven 分节伸缩梯复刻",
    kind: "extension-ladder",
    sourceAssetId: "ladder_sectioned_01",
    sourceName: "Ladder Sectioned 01",
    sourceImage: `${SOURCE_THUMB}/ladder_sectioned_01.png?width=512&height=512`,
    sourceDimensionsMm: [661.503, 177.621, 2134.558],
    defaults: { kind: "extension-ladder", width: 0.662, depth: 0.178, height: 2.135, detail: 1, seed: 641, variation: 0.42, structure: 14, damage: 0.22 },
  },
  {
    id: "polyhaven-wooden-ladder-02",
    name: "Poly Haven 传统折叠木梯复刻",
    kind: "folding-ladder",
    sourceAssetId: "wooden_ladder_02",
    sourceName: "Wooden Ladder 02",
    sourceImage: `${SOURCE_THUMB}/wooden_ladder_02.png?width=512&height=512`,
    sourceDimensionsMm: [989.506, 618.138, 1722.18],
    defaults: { kind: "folding-ladder", width: 0.99, depth: 0.618, height: 1.722, detail: 1, seed: 651, variation: 0.58, structure: 10, damage: 0.38 },
  },
  {
    id: "polyhaven-measuring-tape-01",
    name: "Poly Haven 工业卷尺复刻",
    kind: "measuring-tape",
    sourceAssetId: "measuring_tape_01",
    sourceName: "Measuring Tape 01",
    sourceImage: `${SOURCE_THUMB}/measuring_tape_01.png?width=512&height=512`,
    sourceDimensionsMm: [40.566, 169.419, 73.414],
    defaults: { kind: "measuring-tape", width: 0.169, depth: 0.041, height: 0.073, detail: 1, seed: 661, variation: 0.46, structure: 18, damage: 0.24 },
  },
  {
    id: "polyhaven-lightbulb-01",
    name: "Poly Haven 白炽灯泡复刻",
    kind: "incandescent-bulb",
    sourceAssetId: "lightbulb_01",
    sourceName: "Lightbulb 01",
    sourceImage: `${SOURCE_THUMB}/lightbulb_01.png?width=512&height=512`,
    sourceDimensionsMm: [59.99, 59.99, 100.289],
    defaults: { kind: "incandescent-bulb", width: 0.06, depth: 0.06, height: 0.1, detail: 1, seed: 671, variation: 0.22, structure: 14, damage: 0.14 },
  },
  {
    id: "polyhaven-modern-ceiling-lamp-01",
    name: "Poly Haven 现代球形吊灯复刻",
    kind: "pendant-lamp",
    sourceAssetId: "modern_ceiling_lamp_01",
    sourceName: "Modern Ceiling Lamp 01",
    sourceImage: `${SOURCE_THUMB}/modern_ceiling_lamp_01.png?width=512&height=512`,
    sourceDimensionsMm: [431.649, 431.661, 951.551],
    defaults: { kind: "pendant-lamp", width: 0.432, depth: 0.432, height: 0.952, detail: 1, seed: 681, variation: 0.5, structure: 12, damage: 0.1 },
  },
  {
    id: "polyhaven-standing-chalkboard-01",
    name: "Poly Haven 立式餐牌黑板复刻",
    kind: "standing-chalkboard",
    sourceAssetId: "standing_chalkboard_01",
    sourceName: "Standing Chalkboard 01",
    sourceImage: `${SOURCE_THUMB}/standing_chalkboard_01.png?width=512&height=512`,
    sourceDimensionsMm: [919.527, 758.705, 1509.032],
    defaults: { kind: "standing-chalkboard", width: 0.92, depth: 0.759, height: 1.509, detail: 1, seed: 691, variation: 0.52, structure: 12, damage: 0.38 },
  },
  {
    id: "polyhaven-rusted-spade-01",
    name: "Poly Haven 旧铁锹复刻",
    kind: "spade",
    sourceAssetId: "rusted_spade_01",
    sourceName: "Rusted Spade 01",
    sourceImage: `${SOURCE_THUMB}/rusted_spade_01.png?width=512&height=512`,
    sourceDimensionsMm: [168.115, 45.564, 1100.905],
    defaults: { kind: "spade", width: 0.168, depth: 0.046, height: 1.101, detail: 1, seed: 681, variation: 0.34, structure: 12, damage: 0.72 },
  },
  {
    id: "polyhaven-handsaw-wood",
    name: "Poly Haven 木柄手锯复刻",
    kind: "handsaw",
    sourceAssetId: "handsaw_wood",
    sourceName: "Handsaw Wood",
    sourceImage: `${SOURCE_THUMB}/handsaw_wood.png?width=512&height=512`,
    sourceDimensionsMm: [40.834, 632.979, 166.52],
    defaults: { kind: "handsaw", width: 0.633, depth: 0.041, height: 0.167, detail: 1, seed: 701, variation: 0.28, structure: 14, damage: 0.34 },
  },
  {
    id: "polyhaven-rusted-hacksaw",
    name: "Poly Haven 旧钢锯复刻",
    kind: "hacksaw",
    sourceAssetId: "rusted_hacksaw",
    sourceName: "Rusted Hacksaw",
    sourceImage: `${SOURCE_THUMB}/rusted_hacksaw.png?width=512&height=512`,
    sourceDimensionsMm: [496.371, 32.826, 109.382],
    defaults: { kind: "hacksaw", width: 0.496, depth: 0.033, height: 0.109, detail: 1, seed: 711, variation: 0.46, structure: 18, damage: 0.68 },
  },
];

const RED: RGB = [0.48, 0.035, 0.025];
const DARK_METAL: RGB = [0.045, 0.04, 0.035];
const HAZARD_YELLOW: RGB = [0.92, 0.61, 0.05];
const CHEST_WOOD: RGB = [0.34, 0.16, 0.065];
const ROPE: RGB = [0.16, 0.09, 0.04];
const BENCH_RED: RGB = [0.25, 0.075, 0.055];
const SHELF_WHITE: RGB = [0.62, 0.6, 0.55];
const FIREPIT_STONE: RGB = [0.24, 0.235, 0.22];
const FIREPIT_GRAVEL: RGB = [0.29, 0.255, 0.21];
const HYDRANT_RED: RGB = [0.52, 0.075, 0.045];
const TREE_BARK: RGB = [0.2, 0.125, 0.065];
const TREE_CUT: RGB = [0.44, 0.3, 0.14];
const MOSS_GREEN: RGB = [0.17, 0.24, 0.08];
const BAG_PAPER: RGB = [0.58, 0.44, 0.25];
const BAG_SEAM: RGB = [0.38, 0.24, 0.11];
const TABLE_BLUE: RGB = [0.08, 0.17, 0.2];
const UTILITY_BLUE: RGB = [0.23, 0.29, 0.31];
const BOOMBOX_BLACK: RGB = [0.035, 0.04, 0.04];
const BOOMBOX_PANEL: RGB = [0.12, 0.13, 0.125];
const SPEAKER_CONE: RGB = [0.025, 0.025, 0.022];
const AGED_BRASS: RGB = [0.46, 0.31, 0.065];
const LANTERN_GLASS: RGB = [0.55, 0.62, 0.58];
const FLAME_GOLD: RGB = [0.95, 0.46, 0.06];
const FLASHLIGHT_YELLOW: RGB = [0.78, 0.48, 0.025];
const REFLECTOR_SILVER: RGB = [0.72, 0.74, 0.72];
const LENS_CLEAR: RGB = [0.68, 0.78, 0.78];
const TOOL_STEEL: RGB = [0.34, 0.36, 0.35];
const TOOL_GRIP: RGB = [0.42, 0.055, 0.035];
const TOOL_WOOD: RGB = [0.34, 0.19, 0.075];
const PIPE_IRON: RGB = [0.13, 0.15, 0.15];
const PIPE_RUST: RGB = [0.32, 0.11, 0.045];
const FORT_STONE: RGB = [0.35, 0.33, 0.28];
const BOULDER_STONE: RGB = [0.31, 0.25, 0.2];
const DEADWOOD_BARK: RGB = [0.16, 0.11, 0.065];
const DEADWOOD_CUT: RGB = [0.34, 0.24, 0.13];
const WICKER_LIGHT: RGB = [0.48, 0.29, 0.105];
const WICKER_DARK: RGB = [0.25, 0.13, 0.045];
const WATERING_ZINC: RGB = [0.34, 0.39, 0.39];
const VISE_BLUE: RGB = [0.08, 0.2, 0.28];
const VISE_STEEL: RGB = [0.42, 0.44, 0.43];
const BINOCULAR_BLACK: RGB = [0.025, 0.028, 0.026];
const BINOCULAR_BRASS: RGB = [0.5, 0.36, 0.09];
const CLOCK_MINT: RGB = [0.18, 0.43, 0.4];
const CLOCK_FACE: RGB = [0.78, 0.76, 0.66];
const CLOCK_STEEL: RGB = [0.55, 0.57, 0.56];
const MEGAPHONE_RED: RGB = [0.58, 0.035, 0.025];
const MEGAPHONE_HORN: RGB = [0.68, 0.66, 0.59];
const OIL_CAN_RED: RGB = [0.38, 0.035, 0.025];
const DRILL_RED: RGB = [0.48, 0.055, 0.035];
const DRILL_WOOD: RGB = [0.29, 0.14, 0.05];
const WHEELCHAIR_STEEL: RGB = [0.17, 0.18, 0.18];
const WHEELCHAIR_SEAT: RGB = [0.12, 0.3, 0.31];
const HOSE_GREEN: RGB = [0.035, 0.22, 0.15];
const REEL_GREEN: RGB = [0.08, 0.3, 0.18];
const MACHINE_GREEN: RGB = [0.22, 0.3, 0.18];
const METER_FACE: RGB = [0.82, 0.79, 0.69];
const LEAD_RED: RGB = [0.6, 0.035, 0.025];
const GENERATOR_YELLOW: RGB = [0.72, 0.47, 0.035];
const ENGINE_ALLOY: RGB = [0.31, 0.32, 0.3];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function provenance(definition: PolyHavenPropDefinition): Record<string, unknown> {
  return {
    referenceSite: "Poly Haven",
    referencePage: `${SOURCE_ASSET}/${definition.sourceAssetId}`,
    referenceCatalog: SOURCE_SITE,
    referenceModel: definition.sourceName,
    referenceImage: definition.sourceImage,
    referenceDimensionsMm: definition.sourceDimensionsMm,
    referenceScope: definition.kind === "ruined-fort-arch" ? "gate-module-from-preview-kit" : "full-asset",
    reconstruction: "procedural-from-public-preview",
    sourceMeshUsed: false,
    sourceTexturesUsed: false,
  };
}

function part(
  definition: PolyHavenPropDefinition,
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surfaceType: string,
  surfaceParams: Record<string, unknown> = {},
  doubleSided = false,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: surfaceType, params: { ...surfaceParams } },
    metadata: provenance(definition),
    ...(doubleSided ? { doubleSided: true } : {}),
  };
}

function buildOilDrum(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const radius = Math.min(p.width, p.depth) / 2;
  const segments = p.detail > 0 ? 40 : 20;
  const body: Mesh[] = [
    transform(cylinder(radius * 0.965, p.height * 0.95, segments), { translate: vec3(0, p.height / 2, 0) }),
    transform(cylinder(radius * 0.94, p.height * 0.025, segments), { translate: vec3(0, p.height * 0.015, 0) }),
    transform(cylinder(radius * 0.94, p.height * 0.025, segments), { translate: vec3(0, p.height * 0.985, 0) }),
  ];
  for (const y of [0.025, 0.34, 0.5, 0.66, 0.975]) {
    body.push(transform(torus(radius * 0.96, radius * 0.025, segments, 8), {
      translate: vec3(0, p.height * y, 0),
    }));
  }
  if (p.detail > 0) {
    for (const y of [0.39, 0.445, 0.555, 0.61]) {
      body.push(transform(torus(radius * 0.958, radius * 0.009, segments, 6), {
        translate: vec3(0, p.height * y, 0),
      }));
    }
  }

  const plugs = [
    transform(cylinder(radius * 0.07, p.height * 0.022, 16), { translate: vec3(radius * 0.48, p.height * 1.005, 0) }),
    transform(cylinder(radius * 0.045, p.height * 0.022, 16), { translate: vec3(-radius * 0.42, p.height * 1.005, radius * 0.2) }),
  ];
  const sign = transform(prism([
    vec2(0, p.height * 0.085),
    vec2(-p.width * 0.075, -p.height * 0.055),
    vec2(p.width * 0.075, -p.height * 0.055),
  ], p.depth * 0.018), {
    rotate: vec3(-Math.PI / 2, 0, 0),
    translate: vec3(0, p.height * 0.43, radius * 0.97),
  });
  const warning = merge(
    transform(box(p.width * 0.012, p.height * 0.07, p.depth * 0.012), { translate: vec3(0, p.height * 0.445, radius * 1.01) }),
    transform(sphere(p.width * 0.012, 10, 6), { translate: vec3(0, p.height * 0.39, radius * 1.01) }),
  );
  return [
    part(definition, "drum_shell", "油桶筒身与加强筋", merge(...body), RED, "metal", { color: RED, roughness: 0.66 }),
    part(definition, "drum_plugs", "桶盖螺塞", merge(...plugs), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.55 }),
    part(definition, "hazard_plate", "危险品标牌", sign, HAZARD_YELLOW, "metal", { color: HAZARD_YELLOW, roughness: 0.62 }, true),
    part(definition, "hazard_mark", "危险品标记", warning, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
  ];
}

function buildWoodenChest(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const wall = Math.min(p.width, p.depth) * 0.055;
  const lidHeight = p.height * 0.16;
  const bodyHeight = p.height - lidHeight;
  const body = roundedBox({ width: p.width, height: bodyHeight, depth: p.depth, radius: wall * 0.32, steps: 2 });
  const lid = roundedBox({ width: p.width * 1.015, height: lidHeight, depth: p.depth * 1.02, radius: lidHeight * 0.3, steps: 3 });
  const planks: Mesh[] = [];
  for (const y of [bodyHeight * 0.32, bodyHeight * 0.66]) {
    planks.push(transform(box(p.width * 0.99, wall * 0.28, p.depth * 1.015), { translate: vec3(0, y, 0) }));
  }
  const rivets: Mesh[] = [];
  if (p.detail > 0) {
    for (const x of [-0.43, -0.15, 0.15, 0.43]) {
      for (const y of [0.18, 0.5, 0.82]) {
        rivets.push(transform(cylinder(wall * 0.17, wall * 0.18, 10), {
          rotate: vec3(Math.PI / 2, 0, 0),
          translate: vec3(p.width * x, bodyHeight * y, p.depth * 0.51),
        }));
      }
    }
  }
  const latch = merge(
    transform(box(wall * 0.55, p.height * 0.18, wall * 0.28), { translate: vec3(0, bodyHeight * 0.92, p.depth * 0.525) }),
    transform(torus(wall * 0.35, wall * 0.1, 16, 6), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyHeight * 0.72, p.depth * 0.54),
    }),
  );
  const handles = [-1, 1].map((side) => transform(torus(p.height * 0.12, wall * 0.16, 20, 7), {
    rotate: vec3(0, 0, Math.PI / 2),
    scale: vec3(1, 1.25, 0.72),
    translate: vec3(side * p.width * 0.515, bodyHeight * 0.55, 0),
  }));
  return [
    part(definition, "chest_body", "木箱箱体与木板缝", merge(transform(body, { translate: vec3(0, bodyHeight / 2, 0) }), ...planks), CHEST_WOOD, "wood", { seed: 21, tone: CHEST_WOOD, ringScale: 12 }),
    part(definition, "chest_lid", "圆角箱盖", transform(lid, { translate: vec3(0, bodyHeight + lidHeight / 2, 0) }), CHEST_WOOD, "wood", { seed: 22, tone: CHEST_WOOD, ringScale: 10 }),
    part(definition, "chest_hardware", "锁扣与铆钉", merge(latch, ...rivets), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.68 }),
    part(definition, "rope_handles", "两侧绳环", merge(...handles), ROPE, "fabric", { color: ROPE, roughness: 0.95 }),
  ];
}

function buildPaintedBench(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const side = p.width * 0.055;
  const board = p.height * 0.055;
  const seatY = p.height * 0.55;
  const shelfY = p.height * 0.16;
  const frame: Mesh[] = [
    transform(box(p.width, board * 1.3, p.depth * 0.85), { translate: vec3(0, seatY, 0) }),
    transform(box(p.width * 0.91, board, p.depth * 0.8), { translate: vec3(0, shelfY, 0) }),
    transform(roundedBox({ width: p.width * 0.94, height: p.height * 0.32, depth: board * 0.75, radius: board * 0.42, steps: 3 }), {
      translate: vec3(0, p.height * 0.82, -p.depth * 0.39),
    }),
  ];
  for (const x of [-p.width / 2 + side / 2, p.width / 2 - side / 2]) {
    frame.push(
      transform(box(side, p.height * 0.72, p.depth * 0.9), { translate: vec3(x, p.height * 0.36, 0) }),
      transform(box(side * 1.25, p.height * 0.2, p.depth * 0.95), { translate: vec3(x, p.height * 0.76, -p.depth * 0.02) }),
      transform(cylinder(side * 0.62, side * 1.45, 16), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(x - Math.sign(x) * side * 0.72, seatY + board * 1.8, p.depth * 0.34),
      }),
    );
  }
  return [part(definition, "bench_assembly", "座面、靠背、侧板与下层搁板", merge(...frame), BENCH_RED, "brushPainted", { seed: 31, color: BENCH_RED, bands: 3 })];
}

function buildShelf(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const side = p.width * 0.065;
  const board = p.height * 0.026;
  const innerWidth = p.width - side * 2;
  const shelves: Mesh[] = [];
  const shelfCount = Math.max(4, Math.round(7 * p.detail));
  for (let i = 0; i < shelfCount; i++) {
    const y = board * 1.2 + (p.height - board * 2.4) * (i / Math.max(1, shelfCount - 1));
    shelves.push(transform(box(innerWidth, board, p.depth * 0.94), { translate: vec3(0, y, 0) }));
  }
  const carcass = [
    transform(box(side, p.height, p.depth), { translate: vec3(-p.width / 2 + side / 2, p.height / 2, 0) }),
    transform(box(side, p.height, p.depth), { translate: vec3(p.width / 2 - side / 2, p.height / 2, 0) }),
    transform(box(innerWidth, p.height, board * 0.65), { translate: vec3(0, p.height / 2, -p.depth / 2 + board * 0.3) }),
    transform(box(p.width * 1.035, board * 1.45, p.depth * 1.04), { translate: vec3(0, board * 0.7, 0) }),
    transform(box(p.width * 1.035, board * 1.45, p.depth * 1.04), { translate: vec3(0, p.height - board * 0.7, 0) }),
  ];
  return [
    part(definition, "shelf_carcass", "搁架侧板与背板", merge(...carcass), SHELF_WHITE, "brushPainted", { seed: 41, color: SHELF_WHITE, bands: 3 }),
    part(definition, "shelf_boards", "七层浅搁板", merge(...shelves), SHELF_WHITE, "brushPainted", { seed: 42, color: SHELF_WHITE, bands: 3 }),
  ];
}

function buildStoneFirePit(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildMasonryRingMeshes(p);
  const parts = [
    part(definition, "firepit_stones", "环形天然砌石", meshes.stones, FIREPIT_STONE, "stone", { color: FIREPIT_STONE, scale: 1.7, seed: p.seed }),
    part(definition, "firepit_infill", "火坑碎石填层", meshes.infill, FIREPIT_GRAVEL, "stone", { color: FIREPIT_GRAVEL, scale: 2.8, seed: p.seed + 1 }),
  ];
  if (meshes.firewood && meshes.cutFaces) {
    parts.push(
      part(definition, "firepit_firewood", "交错堆叠柴火", meshes.firewood, DEADWOOD_BARK, "bark", { color: DEADWOOD_BARK, scale: 3.2, seed: p.seed + 2 }),
      part(definition, "firepit_cut_faces", "柴火切割端面", meshes.cutFaces, DEADWOOD_CUT, "wood", { tone: DEADWOOD_CUT, ringScale: 20, seed: p.seed + 3 }),
    );
  }
  return parts;
}

function buildFireHydrant(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildHydrantMeshes(p);
  const parts = [
    part(definition, "hydrant_body", "消防栓柱体与钟形顶盖", meshes.body, HYDRANT_RED, "metal", { color: HYDRANT_RED, roughness: 0.62 }),
    part(definition, "hydrant_outlets", "侧向接口与前盖", meshes.outlets, HYDRANT_RED, "metal", { color: HYDRANT_RED, roughness: 0.58 }),
    part(definition, "hydrant_fasteners", "底座螺栓与盖帽螺母", meshes.fasteners, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.56 }),
  ];
  if (meshes.chain) {
    parts.push(part(definition, "hydrant_chain", "防丢金属链", meshes.chain, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.52 }));
  }
  return parts;
}

function buildTreeStump(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildRootedStumpMeshes(p);
  const parts = [
    part(definition, "stump_trunk", "不规则残桩树干", meshes.trunk, TREE_BARK, "bark", { color: TREE_BARK, seed: p.seed, scale: 2.2 }),
    part(definition, "stump_roots", "放射状板根与土丘", meshes.roots, TREE_BARK, "bark", { color: TREE_BARK, seed: p.seed + 1, scale: 2.8 }),
    part(definition, "stump_cut_face", "树桩截面年轮", meshes.cutFace, TREE_CUT, "wood", { tone: TREE_CUT, seed: p.seed + 2, ringScale: 18 }),
  ];
  if (meshes.moss) {
    parts.push(part(definition, "stump_moss", "树皮苔藓斑块", meshes.moss, MOSS_GREEN, "moss", { color: MOSS_GREEN, seed: p.seed + 3, scale: 4 }));
  }
  return parts;
}

function buildCementBag(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildSoftBagMeshes(p);
  const parts = [
    part(definition, "cement_bag_body", "充填纸袋软体", meshes.body, BAG_PAPER, "fabric", { color: BAG_PAPER, roughness: 0.96, seed: p.seed }),
    part(definition, "cement_bag_seams", "两端折边封口", meshes.seams, BAG_SEAM, "fabric", { color: BAG_SEAM, roughness: 0.9, seed: p.seed + 1 }),
  ];
  if (meshes.folds) {
    parts.push(part(definition, "cement_bag_folds", "袋面压褶", meshes.folds, BAG_PAPER, "fabric", { color: BAG_PAPER, roughness: 0.97, seed: p.seed + 2 }));
  }
  return parts;
}

function buildPaintedTable(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildTimberTableMeshes(p);
  const parts = [
    part(definition, "table_top_boards", "分缝木板桌面", meshes.boards, TABLE_BLUE, "brushPainted", { color: TABLE_BLUE, seed: p.seed, bands: 4 }),
    part(definition, "table_trestle_frame", "双脚架与横向拉梁", meshes.frame, TABLE_BLUE, "brushPainted", { color: TABLE_BLUE, seed: p.seed + 1, bands: 3 }),
  ];
  if (meshes.fasteners) {
    parts.push(part(definition, "table_fasteners", "桌架连接螺栓", meshes.fasteners, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.64 }));
  }
  return parts;
}

function buildUtilityBox(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const baseHeight = p.height * 0.1;
  const shellHeight = p.height - baseHeight;
  const lip = Math.min(p.width, p.depth) * 0.025;
  const cabinet = merge(
    transform(roundedBox({ width: p.width, height: shellHeight, depth: p.depth, radius: lip, steps: 2 }), {
      translate: vec3(0, baseHeight + shellHeight / 2, 0),
    }),
    transform(box(p.width * 1.04, lip * 1.8, p.depth * 1.04), { translate: vec3(0, p.height - lip * 0.9, 0) }),
    transform(box(p.width * 1.03, baseHeight, p.depth * 0.92), { translate: vec3(0, baseHeight / 2, 0) }),
  );
  const door = merge(
    transform(roundedBox({ width: p.width * 0.89, height: shellHeight * 0.82, depth: lip * 1.35, radius: lip * 0.55, steps: 2 }), {
      translate: vec3(0, baseHeight + shellHeight * 0.52, p.depth / 2 + lip * 0.48),
    }),
    transform(box(p.width * 0.34, p.height * 0.11, lip * 0.45), {
      translate: vec3(-p.width * 0.13, p.height * 0.62, p.depth / 2 + lip * 1.2),
    }),
  );
  const hardware: Mesh[] = [
    transform(box(p.width * 0.055, p.height * 0.13, lip * 1.6), {
      translate: vec3(-p.width * 0.34, p.height * 0.46, p.depth / 2 + lip * 1.25),
    }),
    transform(torus(p.width * 0.024, p.width * 0.007, 14, 6), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(-p.width * 0.34, p.height * 0.43, p.depth / 2 + lip * 2.1),
    }),
  ];
  for (const y of [0.25, 0.5, 0.75]) {
    hardware.push(transform(cylinder(lip * 0.42, lip * 0.75, 10), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(p.width * 0.445, baseHeight + shellHeight * y, p.depth / 2 + lip * 0.9),
    }));
  }
  const vents: Mesh[] = [];
  const ventCount = Math.max(4, Math.round(p.structure));
  for (let i = 0; i < ventCount; i++) {
    const x = ((i + 0.5) / ventCount - 0.5) * p.width * 0.72;
    vents.push(transform(box(p.width * 0.045, baseHeight * 0.42, lip * 1.4), {
      translate: vec3(x, baseHeight * 0.48, p.depth / 2 + lip * 0.5),
    }));
  }
  return [
    part(definition, "utility_cabinet", "配电箱钣金柜体", cabinet, UTILITY_BLUE, "metal", { color: UTILITY_BLUE, roughness: 0.72 }),
    part(definition, "utility_door", "配电箱检修门", door, UTILITY_BLUE, "brushPainted", { color: UTILITY_BLUE, seed: p.seed, bands: 2 }),
    part(definition, "utility_hardware", "门锁、铰链与编号牌", merge(...hardware), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.6 }),
    part(definition, "utility_vents", "底座散热百叶", merge(...vents), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.68 }),
  ];
}

function buildBoombox(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const bodyHeight = p.height * 0.66;
  const bodyY = bodyHeight / 2;
  const frontZ = p.depth / 2;
  const chassis = merge(
    transform(roundedBox({ width: p.width, height: bodyHeight, depth: p.depth, radius: p.height * 0.035, steps: 2 }), {
      translate: vec3(0, bodyY, 0),
    }),
    transform(box(p.width * 0.92, p.height * 0.16, p.depth * 1.03), { translate: vec3(0, bodyHeight * 0.78, 0) }),
  );
  const speakerRadius = Math.min(p.width * 0.17, bodyHeight * 0.34);
  const speakers: Mesh[] = [];
  for (const x of [-p.width * 0.32, p.width * 0.32]) {
    speakers.push(
      transform(cylinder(speakerRadius, p.depth * 0.035, 32), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(x, bodyHeight * 0.38, frontZ * 1.04),
      }),
      transform(torus(speakerRadius * 0.83, speakerRadius * 0.08, 32, 8), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(x, bodyHeight * 0.38, frontZ * 1.11),
      }),
    );
  }
  const cassette = merge(
    transform(roundedBox({ width: p.width * 0.19, height: bodyHeight * 0.28, depth: p.depth * 0.04, radius: p.height * 0.012, steps: 2 }), {
      translate: vec3(0, bodyHeight * 0.3, frontZ * 1.08),
    }),
    transform(box(p.width * 0.11, bodyHeight * 0.12, p.depth * 0.025), { translate: vec3(0, bodyHeight * 0.31, frontZ * 1.15) }),
  );
  const controls: Mesh[] = [];
  const controlCount = Math.max(4, Math.round(p.structure * 0.75));
  for (let i = 0; i < controlCount; i++) {
    const x = ((i + 0.5) / controlCount - 0.5) * p.width * 0.44;
    controls.push(transform(cylinder(p.height * 0.018, p.depth * 0.045, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(x, bodyHeight * 0.72, frontZ * 1.1),
    }));
  }
  for (let i = 0; i < 8; i++) {
    const x = ((i + 0.5) / 8 - 0.5) * p.width * 0.38;
    controls.push(transform(box(p.width * 0.025, p.height * 0.025, p.depth * 0.04), {
      translate: vec3(x, bodyHeight * 0.08, frontZ * 1.1),
    }));
  }
  const handleThickness = p.height * 0.035;
  const handleY = p.height * 0.82;
  const handle = merge(
    transform(box(p.width * 0.36, handleThickness, p.depth * 0.42), { translate: vec3(0, p.height - handleThickness / 2, 0) }),
    transform(box(handleThickness, p.height * 0.27, p.depth * 0.42), { translate: vec3(-p.width * 0.18, handleY, 0) }),
    transform(box(handleThickness, p.height * 0.27, p.depth * 0.42), { translate: vec3(p.width * 0.18, handleY, 0) }),
  );
  return [
    part(definition, "boombox_chassis", "收录机便携机身", chassis, BOOMBOX_BLACK, "plastic", { color: BOOMBOX_BLACK, roughness: 0.68 }),
    part(definition, "boombox_speakers", "左右扬声器单元", merge(...speakers), SPEAKER_CONE, "plastic", { color: SPEAKER_CONE, roughness: 0.78 }),
    part(definition, "boombox_cassette", "中央磁带仓", cassette, BOOMBOX_PANEL, "plastic", { color: BOOMBOX_PANEL, roughness: 0.54 }),
    part(definition, "boombox_controls", "旋钮、推子与功能键", merge(...controls), BOOMBOX_PANEL, "plastic", { color: BOOMBOX_PANEL, roughness: 0.52 }),
    part(definition, "boombox_handle", "顶部提手", handle, BOOMBOX_BLACK, "plastic", { color: BOOMBOX_BLACK, roughness: 0.7 }),
  ];
}

function buildBrassLantern(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const radius = Math.min(p.width, p.depth) / 2;
  const bodyTop = p.height * 0.6;
  const chamberBottom = p.height * 0.12;
  const chamberTop = p.height * 0.54;
  const panelCount = Math.max(4, Math.round(p.structure));
  const shell = merge(
    transform(cylinder(radius, p.height * 0.055, 32), { translate: vec3(0, p.height * 0.028, 0) }),
    transform(torus(radius * 0.82, radius * 0.09, 32, 8), { translate: vec3(0, p.height * 0.08, 0) }),
    transform(cylinder(radius * 0.9, p.height * 0.035, 32), { translate: vec3(0, chamberTop + p.height * 0.018, 0) }),
    lathe([
      vec2(radius * 0.88, chamberTop + p.height * 0.035),
      vec2(radius * 0.62, bodyTop),
      vec2(radius * 0.28, bodyTop + p.height * 0.045),
    ], { segments: 32 }),
    transform(cylinder(radius * 0.3, p.height * 0.035, 24), { translate: vec3(0, bodyTop + p.height * 0.055, 0) }),
  );
  const frame: Mesh[] = [];
  const glass: Mesh[] = [];
  const chamberRadius = radius * 0.78;
  const chamberHeight = chamberTop - chamberBottom;
  const panelWidth = 2 * chamberRadius * Math.sin(Math.PI / panelCount) * 0.88;
  for (let i = 0; i < panelCount; i++) {
    const angle = i / panelCount * Math.PI * 2;
    const panelAngle = angle + Math.PI / panelCount;
    const x = Math.cos(angle) * chamberRadius;
    const z = Math.sin(angle) * chamberRadius;
    frame.push(transform(cylinder(radius * 0.035, chamberHeight, 10), {
      translate: vec3(x, chamberBottom + chamberHeight / 2, z),
    }));
    glass.push(transform(box(panelWidth, chamberHeight * 0.9, radius * 0.018), {
      rotate: vec3(0, -panelAngle, 0),
      translate: vec3(Math.cos(panelAngle) * chamberRadius * 0.92, chamberBottom + chamberHeight / 2, Math.sin(panelAngle) * chamberRadius * 0.92),
    }));
  }
  const burner = merge(
    transform(cylinder(radius * 0.38, p.height * 0.035, 24), { translate: vec3(0, chamberBottom + p.height * 0.02, 0) }),
    transform(cylinder(radius * 0.15, p.height * 0.09, 16), { translate: vec3(0, chamberBottom + p.height * 0.07, 0) }),
    transform(prism([vec2(0, p.height * 0.055), vec2(-radius * 0.12, 0), vec2(radius * 0.12, 0)], radius * 0.05), {
      rotate: vec3(0, 0, 0),
      translate: vec3(0, chamberBottom + p.height * 0.1, 0),
    }),
  );
  const chain: Mesh[] = [];
  const linkCount = Math.max(4, Math.round(6 + p.detail * 5));
  const chainStart = bodyTop + p.height * 0.055;
  const chainLength = p.height - chainStart;
  for (let i = 0; i < linkCount; i++) {
    chain.push(transform(torus(radius * 0.105, radius * 0.025, 12, 6), {
      rotate: vec3(i % 2 === 0 ? Math.PI / 2 : 0, 0, i % 2 === 0 ? 0 : Math.PI / 2),
      translate: vec3(0, chainStart + chainLength * ((i + 0.5) / linkCount), 0),
    }));
  }
  return [
    part(definition, "lantern_brass_shell", "灯笼旋压底座与顶盖", shell, AGED_BRASS, "metal", { color: AGED_BRASS, roughness: 0.42 }),
    part(definition, "lantern_frame", "径向黄铜护框", merge(...frame), AGED_BRASS, "metal", { color: AGED_BRASS, roughness: 0.46 }),
    part(definition, "lantern_glass", "分片透明玻璃罩", merge(...glass), LANTERN_GLASS, "glass", { color: LANTERN_GLASS, roughness: 0.08, transmission: 0.82 }),
    part(definition, "lantern_burner", "中央油盏与火焰", burner, FLAME_GOLD, "emissive", { color: FLAME_GOLD, intensity: 1.8 }),
    part(definition, "lantern_chain", "顶部悬挂链条", merge(...chain), AGED_BRASS, "metal", { color: AGED_BRASS, roughness: 0.48 }),
  ];
}

function buildFlashlight(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const radius = Math.min(p.width, p.height * 0.96) / 2;
  const reflectorLength = p.depth * 0.34;
  const reflectorBaseZ = p.depth * 0.08;
  const bodyDepth = p.depth - reflectorLength;
  const bodyHeight = p.height * 0.62;
  const housing = merge(
    transform(roundedBox({ width: p.width * 0.82, height: bodyHeight, depth: bodyDepth, radius: radius * 0.18, steps: 2 }), {
      translate: vec3(0, bodyHeight / 2, -p.depth / 2 + bodyDepth / 2),
    }),
    transform(cylinder(radius * 0.62, p.depth * 0.05, 24), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyHeight * 0.48, reflectorBaseZ - p.depth * 0.025),
    }),
  );
  const reflector = transform(lathe([
    vec2(radius * 0.12, 0),
    vec2(radius * 0.28, reflectorLength * 0.08),
    vec2(radius * 0.94, reflectorLength * 0.88),
    vec2(radius, reflectorLength),
    vec2(radius * 0.88, reflectorLength * 0.98),
    vec2(radius * 0.2, reflectorLength * 0.12),
  ], { segments: p.detail > 0 ? 40 : 24 }), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, bodyHeight * 0.48, reflectorBaseZ),
  });
  const lens = transform(cylinder(radius * 0.91, p.depth * 0.015, 40), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, bodyHeight * 0.48, reflectorBaseZ + reflectorLength * 1.01),
  });
  const gripRings: Mesh[] = [];
  const ringCount = Math.max(6, Math.round(p.structure));
  for (let i = 0; i < ringCount; i++) {
    gripRings.push(transform(torus(radius * 1.01, radius * 0.045, 28, 6), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, bodyHeight * 0.48, reflectorBaseZ + reflectorLength * (0.72 + i * 0.025)),
    }));
  }
  const handleThickness = p.height * 0.12;
  const handle = merge(
    transform(roundedBox({ width: p.width * 0.58, height: handleThickness, depth: bodyDepth * 0.55, radius: handleThickness * 0.42, steps: 2 }), {
      translate: vec3(0, p.height - handleThickness / 2, -p.depth * 0.16),
    }),
    transform(box(handleThickness, p.height * 0.35, bodyDepth * 0.5), { translate: vec3(-p.width * 0.25, p.height * 0.76, -p.depth * 0.16) }),
    transform(box(handleThickness, p.height * 0.35, bodyDepth * 0.5), { translate: vec3(p.width * 0.25, p.height * 0.76, -p.depth * 0.16) }),
  );
  return [
    part(definition, "flashlight_housing", "手电筒电池仓外壳", housing, FLASHLIGHT_YELLOW, "plastic", { color: FLASHLIGHT_YELLOW, roughness: 0.62 }),
    part(definition, "flashlight_reflector", "旋转抛物面反光杯", reflector, REFLECTOR_SILVER, "metal", { color: REFLECTOR_SILVER, roughness: 0.16 }),
    part(definition, "flashlight_lens", "前端透明镜片", lens, LENS_CLEAR, "glass", { color: LENS_CLEAR, roughness: 0.04, transmission: 0.88 }),
    part(definition, "flashlight_handle", "顶部一体提手", handle, FLASHLIGHT_YELLOW, "plastic", { color: FLASHLIGHT_YELLOW, roughness: 0.66 }),
    part(definition, "flashlight_grip_rings", "灯头防滑散热环", merge(...gripRings), BOOMBOX_BLACK, "rubber", { color: BOOMBOX_BLACK, roughness: 0.84 }),
  ];
}

function buildHandTool(definition: PolyHavenPropDefinition, p: PolyHavenPropParams, kind: HandToolKind): NamedPart[] {
  const meshes = buildHandToolMeshes(kind, p);
  const handleColor = kind === "pliers" ? TOOL_GRIP : TOOL_WOOD;
  const handleSurface = kind === "pliers" ? "rubber" : "wood";
  const names: Record<HandToolKind, string> = {
    "adjustable-wrench": "活动扳手",
    pliers: "组合钳",
    screwdriver: "一字螺丝刀",
    "cross-pein-hammer": "横刃锤",
    hatchet: "手斧",
  };
  const parts = [
    part(definition, "hand_tool_handle", "手工具握柄", meshes.handle, handleColor, handleSurface, { color: handleColor, tone: handleColor, roughness: 0.78, seed: p.seed }),
    part(definition, "hand_tool_head", `手工具${names[kind]}工作头`, meshes.head, TOOL_STEEL, "metal", { color: TOOL_STEEL, roughness: 0.58, rust: p.damage }),
  ];
  return parts;
}

function buildIndustrialPipes(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildIndustrialPipeMeshes(p);
  const parts = [
    part(definition, "industrial_pipe_runs", "弯管、立管与三通主管", meshes.pipes, PIPE_IRON, "metal", { color: PIPE_IRON, roughness: 0.58, rust: p.damage }),
    part(definition, "industrial_pipe_flanges", "模块化连接法兰", meshes.flanges, PIPE_IRON, "metal", { color: PIPE_IRON, roughness: 0.54, rust: p.damage }),
  ];
  if (meshes.valve) {
    parts.push(part(definition, "industrial_pipe_valve", "前置手轮阀门", meshes.valve, PIPE_RUST, "metal", { color: PIPE_RUST, roughness: 0.66 }));
  }
  if (meshes.fasteners) {
    parts.push(part(definition, "industrial_pipe_fasteners", "法兰环形螺栓", meshes.fasteners, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }));
  }
  return parts;
}

function buildRuinedFortArch(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildRuinedArchMeshes(p);
  const parts = [
    part(definition, "fort_arch_structure", "城堡门洞、拱券与残损桥墩", meshes.structure, FORT_STONE, "stone", { color: FORT_STONE, scale: 1.7, seed: p.seed }),
  ];
  if (meshes.rubble) {
    parts.push(part(definition, "fort_arch_rubble", "坍塌碎石与脱落砌块", meshes.rubble, FORT_STONE, "stone", { color: FORT_STONE, scale: 2.4, seed: p.seed + 1 }));
  }
  return parts;
}

function buildBoulder(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildBoulderMeshes(p);
  return [
    part(definition, "weathered_boulder", "分层风化巨石", meshes.rock, BOULDER_STONE, "stone", { color: BOULDER_STONE, scale: 2.1, seed: p.seed }),
  ];
}

function buildDeadwood(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildDeadwoodMeshes(p);
  const parts = [
    part(definition, "deadwood_trunk", "弯曲倒伏主干", meshes.trunk, DEADWOOD_BARK, "bark", { color: DEADWOOD_BARK, seed: p.seed, scale: 2.8 }),
    part(definition, "deadwood_cut_faces", "两端断裂木质截面", meshes.cutFaces, DEADWOOD_CUT, "wood", { tone: DEADWOOD_CUT, seed: p.seed + 1, ringScale: 20 }),
  ];
  if (meshes.branches) {
    parts.push(part(definition, "deadwood_branches", "沿主干分布的折断枝杈", meshes.branches, DEADWOOD_BARK, "bark", { color: DEADWOOD_BARK, seed: p.seed + 2, scale: 3.2 }));
  }
  return parts;
}

function buildWickerBasket(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildWickerBasketMeshes(p);
  return [
    part(definition, "basket_radial_stakes", "篮体放射经条", meshes.stakes, WICKER_DARK, "wood", { tone: WICKER_DARK, grainScale: 26, seed: p.seed }),
    part(definition, "basket_over_under_weave", "交错压叠纬条", meshes.weave, WICKER_LIGHT, "wood", { tone: WICKER_LIGHT, grainScale: 32, seed: p.seed + 1 }),
    part(definition, "basket_woven_base", "交错编织承重篮底", meshes.base, WICKER_LIGHT, "wood", { tone: WICKER_LIGHT, grainScale: 34, seed: p.seed + 2 }),
    part(definition, "basket_braided_rim", "双股收口篮沿", meshes.rim, WICKER_DARK, "wood", { tone: WICKER_DARK, grainScale: 30, seed: p.seed + 3 }),
  ];
}

function buildWateringCan(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildWateringCanMeshes(p);
  const surface = { color: WATERING_ZINC, roughness: 0.62, rust: p.damage };
  const parts = [
    part(definition, "watering_can_shell", "旋压薄板壶身", meshes.body, WATERING_ZINC, "metal", surface),
    part(definition, "watering_can_spout", "渐缩出水管与莲蓬头", meshes.spout, WATERING_ZINC, "metal", surface),
    part(definition, "watering_can_handle", "曲线扫掠提手", meshes.handle, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.58, rust: p.damage }),
  ];
  if (meshes.hardware) {
    parts.push(part(definition, "watering_can_hardware", "卷边、加强筋与注水口", meshes.hardware, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.56, rust: p.damage }));
  }
  return parts;
}

function buildBenchVise(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const meshes = buildBenchViseMeshes(p);
  return [
    part(definition, "vise_cast_body", "台钳铸造底座与固定钳身", meshes.body, VISE_BLUE, "metal", { color: VISE_BLUE, roughness: 0.66, rust: p.damage }),
    part(definition, "vise_jaws", "固定钳口与滑动钳口", meshes.jaws, VISE_STEEL, "metal", { color: VISE_STEEL, roughness: 0.48 }),
    part(definition, "vise_lead_screw", "钳口联动丝杠与螺母", meshes.screw, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
    part(definition, "vise_tommy_bar", "横向滑杆与限位球", meshes.handle, VISE_STEEL, "metal", { color: VISE_STEEL, roughness: 0.44 }),
  ];
}

function buildBinoculars(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 32 : 18;
  const barrelX = p.width * 0.28;
  const centerY = p.height * 0.48;
  const barrelRadius = Math.min(p.width * 0.16, p.height * 0.43);
  const tube = (radius: number, length: number, x: number, z: number): Mesh => transform(cylinder(radius, length, segments), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(x, centerY, z),
  });
  const barrels: Mesh[] = [];
  const optics: Mesh[] = [];
  const grips: Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * barrelX;
    barrels.push(
      tube(barrelRadius * 0.82, p.depth * 0.74, x, 0),
      tube(barrelRadius, p.depth * 0.2, x, p.depth * 0.39),
      tube(barrelRadius * 0.68, p.depth * 0.19, x, -p.depth * 0.405),
    );
    optics.push(
      tube(barrelRadius * 0.82, p.depth * 0.018, x, p.depth * 0.495),
      tube(barrelRadius * 0.53, p.depth * 0.018, x, -p.depth * 0.5),
      transform(torus(barrelRadius * 0.85, barrelRadius * 0.07, segments, 7), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(x, centerY, p.depth * 0.47),
      }),
    );
    for (const z of [-0.17, -0.05, 0.08, 0.2]) {
      grips.push(transform(torus(barrelRadius * 0.84, barrelRadius * 0.025, segments, 6), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(x, centerY, p.depth * z),
      }));
    }
  }
  const bridge = merge(
    transform(roundedBox({ width: p.width * 0.43, height: p.height * 0.26, depth: p.depth * 0.15, radius: p.height * 0.06, steps: 2 }), {
      translate: vec3(0, centerY, -p.depth * 0.12),
    }),
    transform(roundedBox({ width: p.width * 0.39, height: p.height * 0.22, depth: p.depth * 0.13, radius: p.height * 0.05, steps: 2 }), {
      translate: vec3(0, centerY, p.depth * 0.18),
    }),
    transform(cylinder(p.height * 0.11, p.height * 0.62, segments), { translate: vec3(0, p.height * 0.31, 0) }),
  );
  const focus = merge(
    transform(cylinder(p.height * 0.14, p.height * 0.22, segments), { translate: vec3(0, p.height * 0.72, -p.depth * 0.02) }),
    transform(torus(p.height * 0.12, p.height * 0.02, segments, 6), { translate: vec3(0, p.height * 0.84, -p.depth * 0.02) }),
  );
  return [
    part(definition, "binocular_barrels", "望远镜左右对称光学筒身", merge(...barrels), BINOCULAR_BLACK, "metal", { color: BINOCULAR_BLACK, roughness: 0.46 }),
    part(definition, "binocular_optics", "望远镜物镜、目镜与黄铜压圈", merge(...optics), BINOCULAR_BRASS, "glass", { color: BINOCULAR_BRASS, roughness: 0.12, transmission: 0.34 }),
    part(definition, "binocular_bridge", "望远镜中央联动铰桥", bridge, BINOCULAR_BLACK, "metal", { color: BINOCULAR_BLACK, roughness: 0.52 }),
    part(definition, "binocular_focus", "望远镜中央调焦轮", focus, BINOCULAR_BLACK, "rubber", { color: BINOCULAR_BLACK, roughness: 0.82 }),
    part(definition, "binocular_grips", "望远镜筒身防滑包覆", merge(...grips), BINOCULAR_BLACK, "rubber", { color: BINOCULAR_BLACK, roughness: 0.88 }),
  ];
}

function buildAlarmClock(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 40 : 24;
  const centerY = p.height * 0.47;
  const caseRadius = Math.min(p.width * 0.36, p.height * 0.43);
  const frontZ = p.depth * 0.41;
  const axialCylinder = (radius: number, length: number, x: number, y: number, z: number): Mesh => transform(cylinder(radius, length, segments), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(x, y, z),
  });
  const clockCase = merge(
    axialCylinder(caseRadius, p.depth * 0.72, 0, centerY, 0),
    transform(torus(caseRadius * 0.97, p.width * 0.012, segments, 7), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, frontZ),
    }),
    transform(box(p.width * 0.035, p.height * 0.2, p.depth * 0.12), { rotate: vec3(0, 0, 0.24), translate: vec3(-p.width * 0.25, p.height * 0.1, 0) }),
    transform(box(p.width * 0.035, p.height * 0.2, p.depth * 0.12), { rotate: vec3(0, 0, -0.24), translate: vec3(p.width * 0.25, p.height * 0.1, 0) }),
    axialCylinder(p.width * 0.032, p.depth * 0.16, 0, centerY, -p.depth * 0.44),
  );
  const dial = merge(
    axialCylinder(caseRadius * 0.88, p.depth * 0.018, 0, centerY, frontZ * 1.04),
    axialCylinder(caseRadius * 0.82, p.depth * 0.008, 0, centerY, frontZ * 1.15),
  );
  const ticks: Mesh[] = [];
  const tickCount = Math.max(12, Math.round(p.structure));
  for (let index = 0; index < tickCount; index++) {
    const angle = index / tickCount * Math.PI * 2;
    const major = index % Math.max(1, Math.round(tickCount / 12)) === 0;
    const length = caseRadius * (major ? 0.14 : 0.08);
    const radial = caseRadius * 0.7;
    ticks.push(transform(box(p.width * 0.008, length, p.depth * 0.014), {
      rotate: vec3(0, 0, -angle),
      translate: vec3(Math.sin(angle) * radial, centerY + Math.cos(angle) * radial, frontZ * 1.22),
    }));
  }
  const hand = (length: number, angle: number, thickness: number): Mesh => transform(box(thickness, length, p.depth * 0.018), {
    rotate: vec3(0, 0, -angle),
    translate: vec3(Math.sin(angle) * length * 0.46, centerY + Math.cos(angle) * length * 0.46, frontZ * 1.26),
  });
  const hands = merge(
    hand(caseRadius * 0.52, -1.05, p.width * 0.012),
    hand(caseRadius * 0.68, 2.55, p.width * 0.008),
    axialCylinder(p.width * 0.018, p.depth * 0.022, 0, centerY, frontZ * 1.28),
  );
  const bells: Mesh[] = [];
  for (const side of [-1, 1]) {
    bells.push(
      transform(sphere(p.width * 0.16, segments, Math.max(8, Math.round(segments / 2))), {
        scale: vec3(1, 0.55, 0.8),
        rotate: vec3(0, 0, side * 0.22),
        translate: vec3(side * p.width * 0.27, p.height * 0.83, 0),
      }),
      transform(cylinder(p.width * 0.018, p.height * 0.13, 12), { rotate: vec3(0, 0, side * 0.32), translate: vec3(side * p.width * 0.18, p.height * 0.72, 0) }),
    );
  }
  bells.push(transform(box(p.width * 0.32, p.height * 0.025, p.depth * 0.05), { translate: vec3(0, p.height * 0.91, 0) }));
  const handle = transform(torus(p.width * 0.22, p.width * 0.025, segments, 7), {
    rotate: vec3(Math.PI / 2, 0, 0),
    scale: vec3(1, 1.25, 1),
    translate: vec3(0, p.height * 0.78, -p.depth * 0.08),
  });
  return [
    part(definition, "alarm_clock_case", "闹钟金属机壳与支脚", clockCase, CLOCK_MINT, "metal", { color: CLOCK_MINT, roughness: 0.52, rust: p.damage }),
    part(definition, "alarm_clock_dial", "闹钟象牙色表盘与玻璃罩", dial, CLOCK_FACE, "glass", { color: CLOCK_FACE, roughness: 0.1, transmission: 0.2 }),
    part(definition, "alarm_clock_ticks", "闹钟径向小时刻度", merge(...ticks), BINOCULAR_BLACK, "plastic", { color: BINOCULAR_BLACK, roughness: 0.68 }),
    part(definition, "alarm_clock_hands", "闹钟时针、分针与中心轴", hands, BINOCULAR_BLACK, "metal", { color: BINOCULAR_BLACK, roughness: 0.38 }),
    part(definition, "alarm_clock_bells", "闹钟双铃与撞锤", merge(...bells), CLOCK_STEEL, "metal", { color: CLOCK_STEEL, roughness: 0.32 }),
    part(definition, "alarm_clock_handle", "闹钟顶部提梁", handle, CLOCK_STEEL, "metal", { color: CLOCK_STEEL, roughness: 0.36 }),
  ];
}

function buildMegaphone(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 40 : 24;
  const hornLength = p.width * 0.68;
  const centerY = p.height * 0.62;
  const throatRadius = Math.min(p.depth * 0.18, p.height * 0.12);
  const mouthRadius = Math.min(p.depth * 0.48, p.height * 0.35);
  const throatX = p.width * 0.18;
  const mouthX = throatX - hornLength;
  const horn = transform(lathe([
    vec2(throatRadius, 0),
    vec2(throatRadius * 1.15, hornLength * 0.12),
    vec2(mouthRadius * 0.55, hornLength * 0.56),
    vec2(mouthRadius, hornLength),
    vec2(mouthRadius * 0.91, hornLength * 0.985),
    vec2(mouthRadius * 0.48, hornLength * 0.55),
    vec2(throatRadius * 0.82, hornLength * 0.1),
  ], { segments }), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(throatX, centerY, 0),
  });
  const rim = merge(
    transform(torus(mouthRadius * 0.96, p.width * 0.018, segments, 8), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(mouthX, centerY, 0),
    }),
    transform(cylinder(throatRadius * 0.9, p.width * 0.035, segments), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(throatX + p.width * 0.018, centerY, 0),
    }),
  );
  const housing = merge(
    transform(roundedBox({ width: p.width * 0.32, height: p.height * 0.35, depth: p.depth * 0.72, radius: p.height * 0.055, steps: 3 }), {
      translate: vec3(p.width * 0.34, centerY, 0),
    }),
    transform(cylinder(p.depth * 0.28, p.width * 0.08, segments), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(p.width * 0.49, centerY, 0),
    }),
  );
  const handle = merge(
    transform(roundedBox({ width: p.width * 0.12, height: p.height * 0.43, depth: p.depth * 0.35, radius: p.width * 0.035, steps: 2 }), {
      rotate: vec3(0, 0, -0.16),
      translate: vec3(p.width * 0.29, p.height * 0.25, 0),
    }),
    transform(box(p.width * 0.09, p.height * 0.06, p.depth * 0.42), {
      translate: vec3(p.width * 0.22, p.height * 0.42, 0),
    }),
  );
  const controls = merge(
    transform(roundedBox({ width: p.width * 0.15, height: p.height * 0.12, depth: p.depth * 0.035, radius: p.width * 0.01, steps: 2 }), {
      translate: vec3(p.width * 0.35, p.height * 0.59, p.depth * 0.38),
    }),
    transform(box(p.width * 0.055, p.height * 0.025, p.depth * 0.025), { translate: vec3(p.width * 0.32, p.height * 0.6, p.depth * 0.405) }),
    transform(cylinder(p.width * 0.018, p.depth * 0.045, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(p.width * 0.39, p.height * 0.6, p.depth * 0.405),
    }),
  );
  return [
    part(definition, "megaphone_horn", "扩音器锥形薄壁号筒", horn, MEGAPHONE_HORN, "plastic", { color: MEGAPHONE_HORN, roughness: 0.48 }, true),
    part(definition, "megaphone_rim", "扩音器防撞口沿与喉管", rim, BINOCULAR_BLACK, "rubber", { color: BINOCULAR_BLACK, roughness: 0.82 }),
    part(definition, "megaphone_housing", "扩音器后部电池机壳", housing, MEGAPHONE_RED, "plastic", { color: MEGAPHONE_RED, roughness: 0.55 }),
    part(definition, "megaphone_handle", "扩音器手枪式握把与扳机", handle, CLOCK_FACE, "plastic", { color: CLOCK_FACE, roughness: 0.62 }),
    part(definition, "megaphone_controls", "扩音器开关、音量旋钮与侧面板", controls, BINOCULAR_BLACK, "plastic", { color: BINOCULAR_BLACK, roughness: 0.66 }),
  ];
}

function buildOilCan(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 32 : 18;
  const bodyRadius = Math.min(p.depth * 0.46, p.width * 0.19);
  const bodyX = -p.width * 0.18;
  const bodyHeight = p.height * 0.5;
  const body = merge(
    transform(lathe([
      vec2(0, 0),
      vec2(bodyRadius * 0.9, 0),
      vec2(bodyRadius, p.height * 0.035),
      vec2(bodyRadius, bodyHeight * 0.83),
      vec2(bodyRadius * 0.86, bodyHeight),
      vec2(bodyRadius * 0.48, bodyHeight + p.height * 0.05),
      vec2(bodyRadius * 0.36, bodyHeight + p.height * 0.085),
    ], { segments }), { translate: vec3(bodyX, 0, 0) }),
    transform(torus(bodyRadius * 0.96, p.depth * 0.018, segments, 6), { translate: vec3(bodyX, p.height * 0.035, 0) }),
    transform(torus(bodyRadius * 0.88, p.depth * 0.014, segments, 6), { translate: vec3(bodyX, bodyHeight * 0.82, 0) }),
  );
  const spoutCurve = smoothCurve(polyline([
    vec3(bodyX + bodyRadius * 0.4, bodyHeight + p.height * 0.07, 0),
    vec3(p.width * 0.02, p.height * 0.63, 0),
    vec3(p.width * 0.25, p.height * 0.79, 0),
    vec3(p.width * 0.49, p.height * 0.96, 0),
  ]), p.detail > 0 ? 5 : 3);
  const spout = merge(
    sweep(spoutCurve, { radius: p.depth * 0.055, sides: p.detail > 0 ? 14 : 8, caps: true, radiusAt: (t) => 1 - t * 0.42 }),
    transform(cylinder(p.depth * 0.045, p.width * 0.055, 12), {
      rotate: vec3(0, 0, -0.95),
      translate: vec3(p.width * 0.5, p.height * 0.965, 0),
    }),
  );
  const pivot = vec3(bodyX, bodyHeight + p.height * 0.09, 0);
  const pump = merge(
    transform(cylinder(bodyRadius * 0.48, p.height * 0.045, segments), { translate: vec3(bodyX, bodyHeight + p.height * 0.045, 0) }),
    transform(cylinder(p.depth * 0.06, p.height * 0.13, 12), { translate: vec3(bodyX, bodyHeight + p.height * 0.12, 0) }),
    transform(sphere(p.depth * 0.07, 12, 7), { translate: pivot }),
    transform(roundedBox({ width: p.width * 0.32, height: p.height * 0.035, depth: p.depth * 0.13, radius: p.depth * 0.025, steps: 2 }), {
      rotate: vec3(0, 0, 0.18),
      translate: vec3(bodyX - p.width * 0.08, bodyHeight + p.height * 0.16, 0),
    }),
    transform(box(p.width * 0.025, p.height * 0.16, p.depth * 0.08), { rotate: vec3(0, 0, -0.35), translate: vec3(bodyX + p.width * 0.04, bodyHeight + p.height * 0.12, 0) }),
  );
  const handleCurve = smoothCurve(polyline([
    vec3(bodyX - bodyRadius * 0.82, p.height * 0.12, 0),
    vec3(-p.width * 0.49, p.height * 0.2, 0),
    vec3(-p.width * 0.49, p.height * 0.48, 0),
    vec3(bodyX - bodyRadius * 0.5, p.height * 0.55, 0),
  ]), p.detail > 0 ? 4 : 2);
  const handle = sweep(handleCurve, { radius: p.depth * 0.045, sides: p.detail > 0 ? 12 : 7, caps: true });
  return [
    part(definition, "oil_can_body", "油壶旋压储油罐体与加强筋", body, OIL_CAN_RED, "metal", { color: OIL_CAN_RED, roughness: 0.62, rust: p.damage }),
    part(definition, "oil_can_spout", "油壶渐细长曲出油嘴", spout, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.48, rust: p.damage }),
    part(definition, "oil_can_pump", "油壶手压泵杆与联动支点", pump, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.52, rust: p.damage }),
    part(definition, "oil_can_handle", "油壶侧置闭合提手", handle, OIL_CAN_RED, "metal", { color: OIL_CAN_RED, roughness: 0.64, rust: p.damage }),
  ];
}

function buildHandDrill(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 24 : 12;
  const gearTeeth = Math.max(16, Math.round(p.structure));
  const gearRadius = p.width * 0.45;
  const gearModule = gearRadius / (gearTeeth / 2 + 1);
  const gearY = p.height * 0.43;
  const shaftRadius = p.width * 0.055;
  const frame = merge(
    transform(roundedBox({ width: p.width * 0.18, height: p.height * 0.56, depth: p.depth * 0.2, radius: p.width * 0.045, steps: 2 }), {
      translate: vec3(0, p.height * 0.58, 0),
    }),
    transform(box(p.width * 0.72, p.height * 0.045, p.depth * 0.16), { translate: vec3(0, gearY, 0) }),
    transform(cylinder(shaftRadius * 1.7, p.depth * 0.42, segments), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, gearY, 0),
    }),
  );
  const driveGear = transform(gear({
    teeth: gearTeeth,
    module: gearModule,
    thickness: p.depth * 0.1,
    boreRadius: shaftRadius * 1.2,
    boreSegments: segments,
  }), {
    rotate: vec3(Math.PI / 2, 0, 0),
    translate: vec3(0, gearY, p.depth * 0.12),
  });
  const spindle = merge(
    transform(gear({
      teeth: Math.max(8, Math.round(gearTeeth / 3)),
      module: gearModule,
      thickness: p.depth * 0.12,
      boreRadius: shaftRadius * 0.55,
      boreSegments: 12,
    }), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, gearY - gearRadius * 0.78, 0),
    }),
    transform(cylinder(shaftRadius, p.height * 0.31, segments), { translate: vec3(0, p.height * 0.2, 0) }),
    transform(lathe([
      vec2(shaftRadius * 1.7, 0),
      vec2(shaftRadius * 2.2, p.height * 0.035),
      vec2(shaftRadius * 1.5, p.height * 0.085),
      vec2(shaftRadius * 0.7, p.height * 0.13),
    ], { segments }), { translate: vec3(0, p.height * 0.02, 0) }),
  );
  const crankX = gearRadius * 0.7;
  const crank = merge(
    transform(cylinder(shaftRadius * 0.65, p.depth * 0.34, segments), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(crankX, gearY, p.depth * 0.24),
    }),
    transform(box(p.width * 0.08, p.height * 0.18, p.depth * 0.09), {
      rotate: vec3(0, 0, -0.28),
      translate: vec3(crankX + p.width * 0.02, gearY + p.height * 0.08, p.depth * 0.39),
    }),
    transform(cylinder(shaftRadius * 1.05, p.depth * 0.2, segments), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(crankX + p.width * 0.045, gearY + p.height * 0.16, p.depth * 0.39),
    }),
  );
  const grips = merge(
    transform(capsule(p.width * 0.1, p.height * 0.2, segments, 4), { translate: vec3(0, p.height * 0.89, 0) }),
    transform(cylinder(p.width * 0.075, p.depth * 0.18, segments), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(crankX + p.width * 0.045, gearY + p.height * 0.16, p.depth * 0.49),
    }),
  );
  return [
    part(definition, "hand_drill_frame", "手摇钻铸铁机架与主轴座", frame, DRILL_RED, "metal", { color: DRILL_RED, roughness: 0.64, rust: p.damage }),
    part(definition, "hand_drill_drive_gear", "手摇钻大齿轮与啮合齿圈", driveGear, DRILL_RED, "metal", { color: DRILL_RED, roughness: 0.58, rust: p.damage }),
    part(definition, "hand_drill_pinion_chuck", "手摇钻小齿轮、钻轴与夹头", spindle, TOOL_STEEL, "metal", { color: TOOL_STEEL, roughness: 0.48 }),
    part(definition, "hand_drill_crank", "手摇钻曲柄联动杆", crank, TOOL_STEEL, "metal", { color: TOOL_STEEL, roughness: 0.5 }),
    part(definition, "hand_drill_grips", "手摇钻顶部握柄与摇把木套", grips, DRILL_WOOD, "wood", { tone: DRILL_WOOD, seed: p.seed, ringScale: 18 }),
  ];
}

function buildWheelchair(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const sides = p.detail > 0 ? 12 : 7;
  const tubeRadius = Math.min(p.width, p.height) * 0.018;
  const wheelRadius = Math.min(p.height * 0.31, p.depth * 0.3);
  const wheelY = wheelRadius + p.height * 0.025;
  const wheelZ = p.depth * 0.07;
  const wheelX = p.width * 0.43;
  const tube = (from: ReturnType<typeof vec3>, to: ReturnType<typeof vec3>, radius = tubeRadius): Mesh =>
    sweep(polyline([from, to]), { radius, sides, caps: true });
  const frameSegments: Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * p.width * 0.31;
    frameSegments.push(
      tube(vec3(x, p.height * 0.34, -p.depth * 0.27), vec3(x, p.height * 0.7, p.depth * 0.16)),
      tube(vec3(x, p.height * 0.34, p.depth * 0.2), vec3(x, p.height * 0.86, p.depth * 0.3)),
      tube(vec3(x, p.height * 0.86, p.depth * 0.3), vec3(x, p.height * 0.97, p.depth * 0.37)),
      tube(vec3(x, p.height * 0.58, -p.depth * 0.19), vec3(x, p.height * 0.64, p.depth * 0.2)),
    );
  }
  frameSegments.push(
    tube(vec3(-p.width * 0.31, p.height * 0.34, -p.depth * 0.27), vec3(p.width * 0.31, p.height * 0.56, p.depth * 0.2), tubeRadius * 0.82),
    tube(vec3(p.width * 0.31, p.height * 0.34, -p.depth * 0.27), vec3(-p.width * 0.31, p.height * 0.56, p.depth * 0.2), tubeRadius * 0.82),
  );
  const driveWheels: Mesh[] = [];
  const spokes: Mesh[] = [];
  const spokeCount = Math.max(12, Math.round(p.structure));
  for (const side of [-1, 1]) {
    const x = side * wheelX;
    driveWheels.push(
      transform(torus(wheelRadius, tubeRadius * 1.55, p.detail > 0 ? 40 : 24, 8), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(x, wheelY, wheelZ),
      }),
      transform(torus(wheelRadius * 0.91, tubeRadius * 0.45, p.detail > 0 ? 32 : 18, 6), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(x, wheelY, wheelZ),
      }),
      transform(cylinder(tubeRadius * 1.7, p.width * 0.04, sides), {
        rotate: vec3(0, 0, Math.PI / 2),
        translate: vec3(x, wheelY, wheelZ),
      }),
    );
    for (let index = 0; index < spokeCount; index++) {
      const angle = index / spokeCount * Math.PI * 2;
      spokes.push(tube(
        vec3(x, wheelY, wheelZ),
        vec3(x, wheelY + Math.cos(angle) * wheelRadius * 0.88, wheelZ + Math.sin(angle) * wheelRadius * 0.88),
        tubeRadius * 0.22,
      ));
    }
  }
  const casters: Mesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * p.width * 0.29;
    const z = -p.depth * 0.37;
    const radius = wheelRadius * 0.22;
    casters.push(
      tube(vec3(x, p.height * 0.33, -p.depth * 0.25), vec3(x, radius * 1.45, z)),
      transform(torus(radius, tubeRadius * 0.9, 24, 7), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(x, radius, z) }),
    );
  }
  const seat = merge(
    transform(roundedBox({ width: p.width * 0.62, height: p.height * 0.045, depth: p.depth * 0.43, radius: p.height * 0.025, steps: 3 }), {
      translate: vec3(0, p.height * 0.57, -p.depth * 0.02),
    }),
    transform(roundedBox({ width: p.width * 0.62, height: p.height * 0.34, depth: p.depth * 0.04, radius: p.height * 0.025, steps: 3 }), {
      rotate: vec3(-0.12, 0, 0),
      translate: vec3(0, p.height * 0.76, p.depth * 0.2),
    }),
    ...[-1, 1].map((side) => transform(roundedBox({ width: p.width * 0.1, height: p.height * 0.045, depth: p.depth * 0.37, radius: p.height * 0.02, steps: 2 }), {
      translate: vec3(side * p.width * 0.31, p.height * 0.7, -p.depth * 0.01),
    })),
  );
  const footrests: Mesh[] = [];
  for (const side of [-1, 1]) {
    footrests.push(
      tube(vec3(side * p.width * 0.25, p.height * 0.45, -p.depth * 0.18), vec3(side * p.width * 0.28, p.height * 0.19, -p.depth * 0.47)),
      transform(roundedBox({ width: p.width * 0.22, height: p.height * 0.025, depth: p.depth * 0.16, radius: p.height * 0.012, steps: 2 }), {
        rotate: vec3(0.12, 0, 0),
        translate: vec3(side * p.width * 0.19, p.height * 0.17, -p.depth * 0.48),
      }),
    );
  }
  return [
    part(definition, "wheelchair_frame", "轮椅镜像管状折叠车架", merge(...frameSegments), WHEELCHAIR_STEEL, "metal", { color: WHEELCHAIR_STEEL, roughness: 0.42 }),
    part(definition, "wheelchair_drive_wheels", "轮椅左右驱动轮圈与轮胎", merge(...driveWheels), BINOCULAR_BLACK, "rubber", { color: BINOCULAR_BLACK, roughness: 0.82 }),
    part(definition, "wheelchair_spokes", "轮椅左右轮组径向辐条", merge(...spokes), TOOL_STEEL, "metal", { color: TOOL_STEEL, roughness: 0.4 }),
    part(definition, "wheelchair_casters", "轮椅前叉与万向脚轮", merge(...casters), BINOCULAR_BLACK, "rubber", { color: BINOCULAR_BLACK, roughness: 0.8 }),
    part(definition, "wheelchair_seat", "轮椅软座、靠背与扶手垫", seat, WHEELCHAIR_SEAT, "fabric", { color: WHEELCHAIR_SEAT, roughness: 0.9 }),
    part(definition, "wheelchair_footrests", "轮椅联动脚托与支杆", merge(...footrests), WHEELCHAIR_STEEL, "metal", { color: WHEELCHAIR_STEEL, roughness: 0.5 }),
  ];
}

function buildHoseReel(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 28 : 16;
  const centerY = p.height * 0.52;
  const centerZ = p.depth * 0.08;
  const axleRadius = Math.min(p.width, p.height) * 0.05;
  const bracket = merge(
    transform(roundedBox({ width: p.width * 0.35, height: p.height * 0.55, depth: p.depth * 0.12, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(0, centerY, -p.depth * 0.41),
    }),
    ...[-1, 1].map((side) => sweep(polyline([
      vec3(side * p.width * 0.14, p.height * 0.3, -p.depth * 0.36),
      vec3(side * p.width * 0.26, centerY, -p.depth * 0.08),
      vec3(side * p.width * 0.2, p.height * 0.73, -p.depth * 0.2),
    ]), { radius: p.width * 0.022, sides: 10, caps: true })),
  );
  const drum = merge(
    transform(cylinder(p.width * 0.22, p.depth * 0.42, segments), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, centerZ),
    }),
    ...[-1, 1].map((side) => transform(torus(p.width * 0.25, p.width * 0.025, segments, 7), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, centerZ + side * p.depth * 0.21),
    })),
    transform(cylinder(axleRadius, p.depth * 0.72, 16), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, centerZ),
    }),
  );
  const turns = Math.max(5, Math.round(p.structure * 0.42));
  const points = [];
  const steps = turns * (p.detail > 0 ? 18 : 10);
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const angle = t * Math.PI * 2 * turns;
    const radius = p.width * (0.11 + t * 0.34);
    const wobble = Math.sin(angle * 0.47 + p.seed) * p.variation * p.depth * 0.025;
    points.push(vec3(
      Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      p.depth * 0.32 + wobble + (t - 0.5) * p.depth * 0.1,
    ));
  }
  const coil = sweep(smoothCurve(polyline(points), p.detail > 0 ? 2 : 1), {
    radius: Math.min(p.width, p.height) * 0.018,
    sides: p.detail > 0 ? 10 : 6,
    caps: true,
  });
  const crank = merge(
    transform(cylinder(axleRadius * 0.55, p.depth * 0.3, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, centerY, p.depth * 0.42),
    }),
    transform(box(p.width * 0.19, p.height * 0.035, p.depth * 0.045), {
      rotate: vec3(0, 0, 0.58),
      translate: vec3(p.width * 0.07, centerY + p.height * 0.06, p.depth * 0.5),
    }),
    transform(cylinder(p.width * 0.025, p.depth * 0.14, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(p.width * 0.15, centerY + p.height * 0.12, p.depth * 0.52),
    }),
  );
  const nozzleCurve = smoothCurve(polyline([
    points[points.length - 1]!,
    vec3(p.width * 0.36, p.height * 0.18, p.depth * 0.34),
    vec3(p.width * 0.42, p.height * 0.12, p.depth * 0.32),
    vec3(p.width * 0.36, -p.height * 0.02, p.depth * 0.28),
  ]), 3);
  const nozzle = merge(
    sweep(nozzleCurve, { radius: p.width * 0.018, sides: 10, caps: true }),
    transform(cylinder(p.width * 0.027, p.height * 0.13, 12), { rotate: vec3(0, 0, -0.5), translate: vec3(p.width * 0.38, p.height * 0.15, p.depth * 0.34) }),
    transform(cylinder(p.width * 0.038, p.height * 0.045, 12), { rotate: vec3(0, 0, -0.5), translate: vec3(p.width * 0.35, p.height * 0.21, p.depth * 0.34) }),
  );
  return [
    part(definition, "hose_reel_bracket", "卷盘壁挂支架与三角撑", bracket, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.6, rust: p.damage }),
    part(definition, "hose_reel_drum", "卷盘滚筒、挡圈与中心轴", drum, REEL_GREEN, "plastic", { color: REEL_GREEN, roughness: 0.64 }),
    part(definition, "hose_reel_coil", "卷盘多层盘绕花园水管", coil, HOSE_GREEN, "rubber", { color: HOSE_GREEN, roughness: 0.82 }),
    part(definition, "hose_reel_crank", "卷盘侧置收管曲柄", crank, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.55 }),
    part(definition, "hose_reel_nozzle", "卷盘垂挂短管与喷枪", nozzle, REEL_GREEN, "plastic", { color: REEL_GREEN, roughness: 0.68 }),
  ];
}

function buildDrillPress(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const segments = p.detail > 0 ? 28 : 16;
  const columnX = p.width * 0.16;
  const columnZ = p.depth * 0.12;
  const tableY = p.height * (0.3 + p.variation * 0.22);
  const base = merge(
    transform(roundedBox({ width: p.width * 0.9, height: p.height * 0.075, depth: p.depth * 0.78, radius: p.width * 0.055, steps: 3 }), {
      translate: vec3(0, p.height * 0.038, 0),
    }),
    transform(roundedBox({ width: p.width * 0.54, height: p.height * 0.045, depth: p.depth * 0.52, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(-p.width * 0.08, p.height * 0.085, -p.depth * 0.08),
    }),
  );
  const column = merge(
    transform(cylinder(p.width * 0.075, p.height * 0.76, segments), { translate: vec3(columnX, p.height * 0.43, columnZ) }),
    transform(cylinder(p.width * 0.13, p.height * 0.045, segments), { translate: vec3(columnX, p.height * 0.1, columnZ) }),
    transform(cylinder(p.width * 0.11, p.height * 0.04, segments), { translate: vec3(columnX, p.height * 0.79, columnZ) }),
  );
  const head = merge(
    transform(roundedBox({ width: p.width * 0.78, height: p.height * 0.2, depth: p.depth * 0.62, radius: p.width * 0.07, steps: 3 }), {
      translate: vec3(-p.width * 0.02, p.height * 0.84, p.depth * 0.02),
    }),
    transform(roundedBox({ width: p.width * 0.66, height: p.height * 0.07, depth: p.depth * 0.54, radius: p.width * 0.05, steps: 2 }), {
      translate: vec3(-p.width * 0.02, p.height * 0.965, p.depth * 0.03),
    }),
    transform(cylinder(p.width * 0.12, p.height * 0.13, segments), { translate: vec3(p.width * 0.15, p.height * 0.88, p.depth * 0.05) }),
  );
  const spindleX = -p.width * 0.18;
  const spindle = merge(
    transform(cylinder(p.width * 0.05, p.height * 0.2, segments), { translate: vec3(spindleX, p.height * 0.72, -p.depth * 0.08) }),
    transform(lathe([
      vec2(p.width * 0.07, 0),
      vec2(p.width * 0.055, p.height * 0.04),
      vec2(p.width * 0.03, p.height * 0.09),
      vec2(p.width * 0.018, p.height * 0.13),
    ], { segments }), { translate: vec3(spindleX, p.height * 0.59, -p.depth * 0.08) }),
    transform(cylinder(p.width * 0.012, p.height * 0.16, 10), { translate: vec3(spindleX, p.height * 0.52, -p.depth * 0.08) }),
  );
  const table = merge(
    transform(roundedBox({ width: p.width * 0.7, height: p.height * 0.045, depth: p.depth * 0.52, radius: p.width * 0.025, steps: 2 }), {
      translate: vec3(-p.width * 0.05, tableY, -p.depth * 0.06),
    }),
    transform(cylinder(p.width * 0.12, p.height * 0.055, segments), { translate: vec3(columnX, tableY - p.height * 0.04, columnZ) }),
    sweep(polyline([
      vec3(columnX, tableY - p.height * 0.04, columnZ),
      vec3(-p.width * 0.05, tableY - p.height * 0.12, -p.depth * 0.02),
      vec3(-p.width * 0.05, tableY - p.height * 0.02, -p.depth * 0.02),
    ]), { radius: p.width * 0.025, sides: 10, caps: true }),
  );
  const controls: Mesh[] = [];
  const hub = vec3(p.width * 0.28, p.height * 0.78, -p.depth * 0.2);
  controls.push(transform(cylinder(p.width * 0.04, p.depth * 0.18, 12), { rotate: vec3(Math.PI / 2, 0, 0), translate: hub }));
  for (let index = 0; index < 3; index++) {
    const angle = index / 3 * Math.PI * 2;
    const end = vec3(hub.x + Math.cos(angle) * p.width * 0.17, hub.y + Math.sin(angle) * p.height * 0.08, hub.z - p.depth * 0.04);
    controls.push(
      sweep(polyline([hub, end]), { radius: p.width * 0.012, sides: 8, caps: true }),
      transform(sphere(p.width * 0.035, 12, 7), { translate: end }),
    );
  }
  controls.push(
    transform(roundedBox({ width: p.width * 0.12, height: p.height * 0.055, depth: p.depth * 0.035, radius: p.width * 0.012, steps: 2 }), {
      translate: vec3(-p.width * 0.22, p.height * 0.84, -p.depth * 0.31),
    }),
    transform(cylinder(p.width * 0.018, p.depth * 0.05, 10), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.24, p.height * 0.84, -p.depth * 0.34) }),
  );
  return [
    part(definition, "drill_press_base", "钻床铸铁底座与工件槽", base, MACHINE_GREEN, "metal", { color: MACHINE_GREEN, roughness: 0.68, rust: p.damage }),
    part(definition, "drill_press_column", "钻床立柱、法兰与升降导轨", column, TOOL_STEEL, "metal", { color: TOOL_STEEL, roughness: 0.45 }),
    part(definition, "drill_press_head", "钻床电机箱与皮带轮上盖", head, MACHINE_GREEN, "metal", { color: MACHINE_GREEN, roughness: 0.62, rust: p.damage }),
    part(definition, "drill_press_spindle", "钻床主轴、夹头与钻针", spindle, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.42 }),
    part(definition, "drill_press_table", "钻床可升降工作台与支臂", table, MACHINE_GREEN, "metal", { color: MACHINE_GREEN, roughness: 0.64, rust: p.damage }),
    part(definition, "drill_press_controls", "钻床三臂进给手柄与电源开关", merge(...controls), DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.5 }),
  ];
}

function buildMultimeter(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const frontZ = p.depth * 0.44;
  const housing = merge(
    transform(roundedBox({ width: p.width * 0.86, height: p.height * 0.82, depth: p.depth * 0.76, radius: p.width * 0.055, steps: 3 }), {
      translate: vec3(0, p.height * 0.41, 0),
    }),
    transform(roundedBox({ width: p.width * 0.72, height: p.height * 0.14, depth: p.depth * 0.12, radius: p.width * 0.035, steps: 2 }), {
      translate: vec3(0, p.height * 0.91, 0),
    }),
    ...[-1, 1].map((side) => transform(box(p.width * 0.09, p.height * 0.2, p.depth * 0.12), {
      translate: vec3(side * p.width * 0.315, p.height * 0.85, 0),
    })),
  );
  const gauge = merge(
    transform(roundedBox({ width: p.width * 0.72, height: p.height * 0.29, depth: p.depth * 0.035, radius: p.width * 0.018, steps: 2 }), {
      translate: vec3(0, p.height * 0.64, frontZ),
    }),
    transform(roundedBox({ width: p.width * 0.76, height: p.height * 0.33, depth: p.depth * 0.025, radius: p.width * 0.02, steps: 2 }), {
      translate: vec3(0, p.height * 0.64, frontZ - p.depth * 0.015),
    }),
  );
  const ticks: Mesh[] = [];
  const tickCount = Math.max(12, Math.round(p.structure));
  const pivotY = p.height * 0.53;
  for (let band = 0; band < 3; band++) {
    const radius = p.width * (0.23 + band * 0.045);
    for (let index = 0; index <= tickCount; index++) {
      const t = index / tickCount;
      const angle = -Math.PI * 0.34 + t * Math.PI * 0.68;
      const major = index % Math.max(1, Math.round(tickCount / 6)) === 0;
      ticks.push(transform(box(p.width * 0.006, p.height * (major ? 0.045 : 0.025), p.depth * 0.012), {
        rotate: vec3(0, 0, -angle),
        translate: vec3(Math.sin(angle) * radius, pivotY + Math.cos(angle) * radius, frontZ + p.depth * 0.025),
      }));
    }
  }
  const needleAngle = -Math.PI * 0.24 + p.variation * Math.PI * 0.48;
  ticks.push(
    transform(box(p.width * 0.01, p.width * 0.29, p.depth * 0.015), {
      rotate: vec3(0, 0, -needleAngle),
      translate: vec3(Math.sin(needleAngle) * p.width * 0.135, pivotY + Math.cos(needleAngle) * p.width * 0.135, frontZ + p.depth * 0.032),
    }),
    transform(cylinder(p.width * 0.025, p.depth * 0.035, 12), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, pivotY, frontZ + p.depth * 0.04) }),
  );
  const selector = merge(
    transform(roundedBox({ width: p.width * 0.68, height: p.height * 0.27, depth: p.depth * 0.035, radius: p.width * 0.018, steps: 2 }), {
      translate: vec3(0, p.height * 0.32, frontZ),
    }),
    transform(cylinder(p.width * 0.105, p.depth * 0.08, p.detail > 0 ? 24 : 14), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(0, p.height * 0.3, frontZ + p.depth * 0.055),
    }),
    transform(box(p.width * 0.025, p.width * 0.12, p.depth * 0.04), {
      rotate: vec3(0, 0, -0.55),
      translate: vec3(0, p.height * 0.3, frontZ + p.depth * 0.105),
    }),
    ...[-1, 1].map((side) => transform(cylinder(p.width * 0.025, p.depth * 0.06, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(side * p.width * 0.2, p.height * 0.12, frontZ + p.depth * 0.05),
    })),
  );
  const leadMeshes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const points = [vec3(side * p.width * 0.2, p.height * 0.12, frontZ + p.depth * 0.08)];
    const coils = 2.4 + side * 0.2;
    for (let index = 1; index <= 48; index++) {
      const t = index / 48;
      const angle = t * Math.PI * 2 * coils;
      points.push(vec3(
        side * p.width * 0.18 + Math.cos(angle) * p.width * (0.12 + t * 0.08),
        p.height * (0.1 - t * 0.18),
        frontZ + p.depth * 0.12 + Math.sin(angle) * p.depth * 0.06,
      ));
    }
    leadMeshes.push(
      sweep(smoothCurve(polyline(points), 2), { radius: p.width * 0.012, sides: 8, caps: true }),
      transform(cylinder(p.width * 0.018, p.height * 0.22, 10), {
        rotate: vec3(0, 0, side * 0.24),
        translate: vec3(side * p.width * 0.38, -p.height * 0.06, frontZ + p.depth * 0.15),
      }),
    );
  }
  return [
    part(definition, "multimeter_housing", "万用表机壳、提手与防撞边框", housing, BINOCULAR_BLACK, "plastic", { color: BINOCULAR_BLACK, roughness: 0.72 }),
    part(definition, "multimeter_gauge", "万用表模拟表头与透明窗", gauge, METER_FACE, "glass", { color: METER_FACE, roughness: 0.12, transmission: 0.18 }),
    part(definition, "multimeter_ticks", "万用表多量程弧形刻度与指针", merge(...ticks), DARK_METAL, "plastic", { color: DARK_METAL, roughness: 0.6 }),
    part(definition, "multimeter_selector", "万用表量程面板、旋钮与插孔", selector, TOOL_STEEL, "plastic", { color: TOOL_STEEL, roughness: 0.66 }),
    part(definition, "multimeter_leads", "万用表红黑盘绕测试线与表笔", merge(...leadMeshes), LEAD_RED, "rubber", { color: LEAD_RED, roughness: 0.82 }),
  ];
}

function buildPortableGenerator(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  const sides = p.detail > 0 ? 12 : 7;
  const tubeRadius = Math.min(p.depth, p.height) * 0.035;
  const tube = (from: ReturnType<typeof vec3>, to: ReturnType<typeof vec3>, radius = tubeRadius): Mesh =>
    sweep(polyline([from, to]), { radius, sides, caps: true });
  const x = p.width * 0.45;
  const z = p.depth * 0.43;
  const y0 = p.height * 0.1;
  const y1 = p.height * 0.91;
  const frame: Mesh[] = [];
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      frame.push(tube(vec3(sideX * x, y0, sideZ * z), vec3(sideX * x, y1, sideZ * z)));
    }
    frame.push(
      tube(vec3(sideX * x, y0, -z), vec3(sideX * x, y0, z)),
      tube(vec3(sideX * x, y1, -z), vec3(sideX * x, y1, z)),
    );
  }
  for (const sideZ of [-1, 1]) {
    frame.push(
      tube(vec3(-x, y0, sideZ * z), vec3(x, y0, sideZ * z)),
      tube(vec3(-x, y1, sideZ * z), vec3(x, y1, sideZ * z)),
    );
  }
  frame.push(
    tube(vec3(-x, y0, -z), vec3(-x * 0.9, y1, -z)),
    tube(vec3(x, y0, -z), vec3(x * 0.9, y1, -z)),
  );
  const fuelTank = merge(
    transform(roundedBox({ width: p.width * 0.7, height: p.height * 0.25, depth: p.depth * 0.67, radius: p.height * 0.055, steps: 3 }), {
      translate: vec3(0, p.height * 0.73, 0),
    }),
    transform(cylinder(p.width * 0.055, p.height * 0.035, 20), { translate: vec3(-p.width * 0.2, p.height * 0.875, 0) }),
    transform(torus(p.width * 0.05, p.width * 0.009, 20, 6), { translate: vec3(-p.width * 0.2, p.height * 0.895, 0) }),
  );
  const engineMeshes: Mesh[] = [
    transform(roundedBox({ width: p.width * 0.32, height: p.height * 0.33, depth: p.depth * 0.43, radius: p.height * 0.035, steps: 2 }), {
      translate: vec3(-p.width * 0.11, p.height * 0.35, 0),
    }),
    transform(cylinder(p.height * 0.12, p.depth * 0.25, 20), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(-p.width * 0.18, p.height * 0.43, p.depth * 0.08) }),
    transform(cylinder(p.height * 0.11, p.width * 0.12, 20), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-p.width * 0.31, p.height * 0.3, 0) }),
  ];
  const finCount = Math.max(5, Math.round(p.structure * 0.55));
  for (let index = 0; index < finCount; index++) {
    const y = p.height * (0.3 + index / Math.max(1, finCount - 1) * 0.22);
    engineMeshes.push(transform(box(p.width * 0.24, p.height * 0.012, p.depth * 0.47), { translate: vec3(-p.width * 0.12, y, 0) }));
  }
  const alternator = merge(
    transform(cylinder(p.height * 0.18, p.width * 0.3, p.detail > 0 ? 28 : 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.2, p.height * 0.32, 0) }),
    transform(torus(p.height * 0.145, p.height * 0.022, 28, 7), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.36, p.height * 0.32, 0) }),
    transform(cylinder(p.height * 0.07, p.width * 0.08, 20), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(p.width * 0.38, p.height * 0.32, 0) }),
  );
  const controls = merge(
    transform(roundedBox({ width: p.width * 0.47, height: p.height * 0.2, depth: p.depth * 0.055, radius: p.height * 0.02, steps: 2 }), {
      translate: vec3(p.width * 0.14, p.height * 0.58, p.depth * 0.38),
    }),
    ...[-0.12, 0.02, 0.16].map((offset) => transform(cylinder(p.height * 0.025, p.depth * 0.06, 12), {
      rotate: vec3(Math.PI / 2, 0, 0),
      translate: vec3(p.width * offset, p.height * 0.59, p.depth * 0.43),
    })),
    transform(roundedBox({ width: p.width * 0.09, height: p.height * 0.06, depth: p.depth * 0.035, radius: p.height * 0.01, steps: 2 }), {
      translate: vec3(p.width * 0.28, p.height * 0.59, p.depth * 0.435),
    }),
  );
  const exhaust = merge(
    transform(roundedBox({ width: p.width * 0.22, height: p.height * 0.18, depth: p.depth * 0.2, radius: p.height * 0.025, steps: 2 }), {
      translate: vec3(-p.width * 0.26, p.height * 0.56, -p.depth * 0.24),
    }),
    sweep(smoothCurve(polyline([
      vec3(-p.width * 0.2, p.height * 0.48, -p.depth * 0.1),
      vec3(-p.width * 0.31, p.height * 0.55, -p.depth * 0.18),
      vec3(-p.width * 0.34, p.height * 0.66, -p.depth * 0.25),
    ]), 3), { radius: p.height * 0.025, sides: 10, caps: true }),
  );
  return [
    part(definition, "generator_frame", "发电机防撞管架与底部横梁", merge(...frame), BINOCULAR_BLACK, "metal", { color: BINOCULAR_BLACK, roughness: 0.56 }),
    part(definition, "generator_fuel_tank", "发电机冲压油箱与加油盖", fuelTank, GENERATOR_YELLOW, "metal", { color: GENERATOR_YELLOW, roughness: 0.62, rust: p.damage }),
    part(definition, "generator_engine", "发电机汽油发动机、缸体与散热片", merge(...engineMeshes), ENGINE_ALLOY, "metal", { color: ENGINE_ALLOY, roughness: 0.58 }),
    part(definition, "generator_alternator", "发电机电机筒、端盖与风扇罩", alternator, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.52 }),
    part(definition, "generator_controls", "发电机插座、电表与控制面板", controls, BINOCULAR_BLACK, "plastic", { color: BINOCULAR_BLACK, roughness: 0.66 }),
    part(definition, "generator_exhaust", "发电机排气管与消声器", exhaust, DARK_METAL, "metal", { color: DARK_METAL, roughness: 0.64, rust: p.damage }),
  ];
}

function buildPriorityProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenPriorityPropMeshes(definition.kind as PolyHavenPriorityPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildRecommendedProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenRecommendedPropMeshes(definition.kind as PolyHavenRecommendedPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildTopCandidate(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenTopCandidateMeshes(definition.kind as PolyHavenTopCandidateKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildNextProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenNextPropMeshes(definition.kind as PolyHavenNextPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildLearningProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenLearningPropMeshes(definition.kind as PolyHavenLearningPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildFinalLearningProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenFinalLearningPropMeshes(definition.kind as PolyHavenFinalLearningPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

function buildDisplayProp(definition: PolyHavenPropDefinition, p: PolyHavenPropParams): NamedPart[] {
  return buildPolyHavenDisplayPropMeshes(definition.kind as PolyHavenDisplayPropKind, p).map((entry) =>
    part(
      definition,
      entry.name,
      entry.label,
      entry.mesh,
      entry.color,
      entry.surfaceType,
      entry.surfaceParams,
      entry.doubleSided,
    ));
}

export function buildPolyHavenPropParts(input: Partial<PolyHavenPropParams> = {}): NamedPart[] {
  const kind = input.kind ?? "oil-drum";
  const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.kind === kind) ?? POLY_HAVEN_PROP_MODELS[0]!;
  const p: PolyHavenPropParams = {
    ...definition.defaults,
    ...input,
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.01, 10),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.01, 5),
    height: clamp(input.height ?? definition.defaults.height, 0.01, 6),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
    seed: Math.max(0, Math.floor(input.seed ?? definition.defaults.seed)),
    variation: clamp(input.variation ?? definition.defaults.variation, 0, 1),
    structure: clamp(Math.round(input.structure ?? definition.defaults.structure), 3, 24),
    damage: clamp(input.damage ?? definition.defaults.damage, 0, 1),
  };
  switch (kind) {
    case "wooden-chest": return buildWoodenChest(definition, p);
    case "painted-bench": return buildPaintedBench(definition, p);
    case "shelf": return buildShelf(definition, p);
    case "stone-fire-pit": return buildStoneFirePit(definition, p);
    case "fire-hydrant": return buildFireHydrant(definition, p);
    case "tree-stump": return buildTreeStump(definition, p);
    case "cement-bag": return buildCementBag(definition, p);
    case "painted-table": return buildPaintedTable(definition, p);
    case "utility-box": return buildUtilityBox(definition, p);
    case "boombox": return buildBoombox(definition, p);
    case "brass-lantern": return buildBrassLantern(definition, p);
    case "flashlight": return buildFlashlight(definition, p);
    case "adjustable-wrench": return buildHandTool(definition, p, kind);
    case "pliers": return buildHandTool(definition, p, kind);
    case "screwdriver": return buildHandTool(definition, p, kind);
    case "cross-pein-hammer": return buildHandTool(definition, p, kind);
    case "hatchet": return buildHandTool(definition, p, kind);
    case "industrial-pipes": return buildIndustrialPipes(definition, p);
    case "ruined-fort-arch": return buildRuinedFortArch(definition, p);
    case "boulder": return buildBoulder(definition, p);
    case "deadwood": return buildDeadwood(definition, p);
    case "wicker-basket": return buildWickerBasket(definition, p);
    case "watering-can": return buildWateringCan(definition, p);
    case "bench-vise": return buildBenchVise(definition, p);
    case "binoculars": return buildBinoculars(definition, p);
    case "alarm-clock": return buildAlarmClock(definition, p);
    case "megaphone": return buildMegaphone(definition, p);
    case "oil-can": return buildOilCan(definition, p);
    case "hand-drill": return buildHandDrill(definition, p);
    case "wheelchair": return buildWheelchair(definition, p);
    case "hose-reel": return buildHoseReel(definition, p);
    case "drill-press": return buildDrillPress(definition, p);
    case "multimeter": return buildMultimeter(definition, p);
    case "portable-generator": return buildPortableGenerator(definition, p);
    case "rectangular-airduct-kit": return buildPriorityProp(definition, p);
    case "welding-cart": return buildPriorityProp(definition, p);
    case "film-projector": return buildPriorityProp(definition, p);
    case "industrial-microscope": return buildPriorityProp(definition, p);
    case "cash-register": return buildPriorityProp(definition, p);
    case "overhead-crane": return buildPriorityProp(definition, p);
    case "vintage-microscope": return buildPriorityProp(definition, p);
    case "power-pole-system": return buildPriorityProp(definition, p);
    case "spinning-wheel": return buildPriorityProp(definition, p);
    case "aircon-unit": return buildPriorityProp(definition, p);
    case "hand-plane": return buildPriorityProp(definition, p);
    case "circular-airduct-kit": return buildRecommendedProp(definition, p);
    case "electric-cable-kit": return buildRecommendedProp(definition, p);
    case "articulated-desk-lamp": return buildRecommendedProp(definition, p);
    case "gamepad": return buildRecommendedProp(definition, p);
    case "grandfather-clock": return buildTopCandidate(definition, p);
    case "cordless-drill": return buildTopCandidate(definition, p);
    case "security-camera": return buildTopCandidate(definition, p);
    case "metal-tool-chest": return buildTopCandidate(definition, p);
    case "modular-fire-escape": return buildTopCandidate(definition, p);
    case "rangefinder-camera": return buildTopCandidate(definition, p);
    case "modular-wooden-pier": return buildTopCandidate(definition, p);
    case "modular-chainlink-fence": return buildTopCandidate(definition, p);
    case "public-payphone": return buildNextProp(definition, p);
    case "ceiling-fan": return buildNextProp(definition, p);
    case "classic-laptop": return buildNextProp(definition, p);
    case "factory-facade-kit": return buildLearningProp(definition, p);
    case "apartment-facade-kit": return buildLearningProp(definition, p);
    case "cassette-player": return buildLearningProp(definition, p);
    case "hand-truck": return buildLearningProp(definition, p);
    case "fire-extinguisher": return buildLearningProp(definition, p);
    case "dartboard": return buildLearningProp(definition, p);
    case "roller-shutter": return buildFinalLearningProp(definition, p);
    case "military-compressor": return buildFinalLearningProp(definition, p);
    case "extension-ladder": return buildFinalLearningProp(definition, p);
    case "folding-ladder": return buildFinalLearningProp(definition, p);
    case "measuring-tape": return buildFinalLearningProp(definition, p);
    case "incandescent-bulb": return buildFinalLearningProp(definition, p);
    case "pendant-lamp": return buildDisplayProp(definition, p);
    case "standing-chalkboard": return buildDisplayProp(definition, p);
    case "spade": return buildFinalLearningProp(definition, p);
    case "handsaw": return buildFinalLearningProp(definition, p);
    case "hacksaw": return buildFinalLearningProp(definition, p);
    default: return buildOilDrum(definition, p);
  }
}
