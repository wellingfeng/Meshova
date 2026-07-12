import {
  box,
  cylinder,
  merge,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type InteriorSystemCategory =
  | "厨房模块"
  | "门窗系统"
  | "家电"
  | "办公家具"
  | "建筑套件";

export type InteriorSystemKind =
  | "base-cabinet"
  | "wall-cabinet"
  | "corner-cabinet"
  | "kitchen-island"
  | "casement-window"
  | "sliding-window"
  | "french-door"
  | "modular-doorway"
  | "refrigerator"
  | "wall-oven"
  | "washing-machine"
  | "television"
  | "workstation"
  | "conference-table"
  | "filing-cabinet"
  | "wall-panel"
  | "structural-column"
  | "structural-beam"
  | "gable-roof"
  | "modular-railing";

export type InteriorAnchorType =
  | "floor"
  | "wall"
  | "ceiling"
  | "countertop"
  | "plumbing"
  | "electrical"
  | "connection-left"
  | "connection-right";

export interface InteriorSystemParams {
  kind: InteriorSystemKind;
  width: number;
  height: number;
  depth: number;
  count: number;
  openness: number;
  style: number;
  detail: number;
}

export interface InteriorSystemDefinition {
  id: string;
  name: string;
  category: InteriorSystemCategory;
  kind: InteriorSystemKind;
  countLabel: string;
  anchors: InteriorAnchorType[];
  defaults: InteriorSystemParams;
}

export type InteriorCombinationKind =
  | "single-wall-kitchen"
  | "l-shaped-kitchen"
  | "island-kitchen";

export interface InteriorCombinationParams {
  kind: InteriorCombinationKind;
  width: number;
  height: number;
  depth: number;
  count: number;
  detail: number;
}

export interface InteriorCombinationDefinition {
  id: string;
  name: string;
  kind: InteriorCombinationKind;
  defaults: InteriorCombinationParams;
}

const WOOD: RGB = [0.5, 0.3, 0.14];
const LIGHT_WOOD: RGB = [0.72, 0.52, 0.3];
const DARK_WOOD: RGB = [0.2, 0.11, 0.055];
const PAINT: RGB = [0.82, 0.81, 0.76];
const WHITE: RGB = [0.92, 0.92, 0.89];
const METAL: RGB = [0.13, 0.15, 0.18];
const STEEL: RGB = [0.46, 0.5, 0.54];
const GLASS: RGB = [0.36, 0.66, 0.76];
const SCREEN: RGB = [0.025, 0.035, 0.045];
const STONE: RGB = [0.48, 0.46, 0.42];
const ROOF: RGB = [0.35, 0.11, 0.07];

function definition(
  kind: InteriorSystemKind,
  name: string,
  category: InteriorSystemCategory,
  countLabel: string,
  anchors: InteriorAnchorType[],
  width: number,
  height: number,
  depth: number,
  count: number,
): InteriorSystemDefinition {
  return {
    id: `interior-${kind}`,
    name,
    category,
    kind,
    countLabel,
    anchors,
    defaults: { kind, width, height, depth, count, openness: 0, style: 0, detail: 1 },
  };
}

export const INTERIOR_SYSTEM_MODELS: InteriorSystemDefinition[] = [
  definition("base-cabinet", "模块化厨房地柜", "厨房模块", "柜门数量", ["floor", "wall", "countertop", "plumbing"], 1.2, 0.9, 0.62, 2),
  definition("wall-cabinet", "模块化厨房吊柜", "厨房模块", "柜门数量", ["wall", "connection-left", "connection-right"], 1.2, 0.76, 0.36, 2),
  definition("corner-cabinet", "L 型厨房转角柜", "厨房模块", "柜门数量", ["floor", "wall", "countertop", "plumbing"], 1.25, 0.9, 1.25, 2),
  definition("kitchen-island", "组合厨房岛台", "厨房模块", "模块数量", ["floor", "countertop", "plumbing", "electrical"], 2.4, 0.92, 1.05, 4),
  definition("casement-window", "多分格平开窗", "门窗系统", "窗扇数量", ["wall", "connection-left", "connection-right"], 1.5, 1.35, 0.16, 2),
  definition("sliding-window", "多轨推拉窗", "门窗系统", "窗扇数量", ["wall", "connection-left", "connection-right"], 1.8, 1.25, 0.18, 3),
  definition("french-door", "玻璃法式双开门", "门窗系统", "玻璃分格", ["floor", "wall", "connection-left", "connection-right"], 1.7, 2.25, 0.18, 4),
  definition("modular-doorway", "带气窗模块门洞", "门窗系统", "侧窗数量", ["floor", "wall", "connection-left", "connection-right"], 1.45, 2.5, 0.22, 1),
  definition("refrigerator", "双门冰箱", "家电", "门体数量", ["floor", "wall", "electrical"], 0.9, 1.85, 0.72, 2),
  definition("wall-oven", "嵌入式烤箱", "家电", "控制旋钮", ["wall", "electrical"], 0.62, 0.62, 0.58, 3),
  definition("washing-machine", "滚筒洗衣机", "家电", "控制按钮", ["floor", "wall", "plumbing", "electrical"], 0.62, 0.86, 0.64, 5),
  definition("television", "薄屏电视", "家电", "底座支点", ["wall", "electrical"], 1.45, 0.86, 0.12, 2),
  definition("workstation", "模块化办公工位", "办公家具", "工位数量", ["floor", "wall", "electrical", "connection-left", "connection-right"], 1.6, 1.25, 0.78, 2),
  definition("conference-table", "会议桌系统", "办公家具", "座位数量", ["floor", "electrical"], 2.8, 0.76, 1.2, 8),
  definition("filing-cabinet", "组合文件柜", "办公家具", "抽屉数量", ["floor", "wall", "connection-left", "connection-right"], 0.72, 1.25, 0.48, 4),
  definition("wall-panel", "模块化墙体", "建筑套件", "墙体分段", ["floor", "ceiling", "connection-left", "connection-right"], 3.6, 2.8, 0.2, 4),
  definition("structural-column", "参数化承重柱", "建筑套件", "柱身分段", ["floor", "ceiling"], 0.48, 3, 0.48, 6),
  definition("structural-beam", "参数化结构梁", "建筑套件", "支撑节点", ["wall", "connection-left", "connection-right"], 4, 0.45, 0.32, 4),
  definition("gable-roof", "模块化双坡屋顶", "建筑套件", "椽条数量", ["wall", "connection-left", "connection-right"], 4.8, 1.6, 5.6, 8),
  definition("modular-railing", "模块化建筑栏杆", "建筑套件", "立柱数量", ["floor", "connection-left", "connection-right"], 3.2, 1.05, 0.14, 9),
];

export const INTERIOR_COMBINATION_MODELS: InteriorCombinationDefinition[] = [
  {
    id: "interior-suite-single-wall-kitchen",
    name: "一字型模块厨房",
    kind: "single-wall-kitchen",
    defaults: { kind: "single-wall-kitchen", width: 4.8, height: 2.45, depth: 2.2, count: 4, detail: 1 },
  },
  {
    id: "interior-suite-l-shaped-kitchen",
    name: "L 型模块厨房",
    kind: "l-shaped-kitchen",
    defaults: { kind: "l-shaped-kitchen", width: 4.2, height: 2.45, depth: 3.6, count: 5, detail: 1 },
  },
  {
    id: "interior-suite-island-kitchen",
    name: "中岛模块厨房",
    kind: "island-kitchen",
    defaults: { kind: "island-kitchen", width: 5.2, height: 2.45, depth: 4.2, count: 6, detail: 1 },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function part(
  name: string,
  label: string,
  meshes: Mesh | Mesh[],
  color: RGB,
  materialSlot: string,
  surfaceType = "plastic",
): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "metal" ? 0.3 : 0.68 } },
    metadata: { materialSlot, collision: "box", proceduralFamily: true },
  };
}

function cabinetShell(width: number, height: number, depth: number, thickness: number): Mesh[] {
  return [
    moved(box(width, thickness, depth), 0, thickness * 0.5, 0),
    moved(box(width, thickness, depth), 0, height - thickness * 0.5, 0),
    moved(box(thickness, height, depth), -width * 0.5 + thickness * 0.5, height * 0.5, 0),
    moved(box(thickness, height, depth), width * 0.5 - thickness * 0.5, height * 0.5, 0),
    moved(box(width, height, thickness), 0, height * 0.5, -depth * 0.5 + thickness * 0.5),
  ];
}

function cabinetFronts(width: number, height: number, depth: number, count: number): Mesh[] {
  const panelWidth = width / count;
  return Array.from({ length: count }, (_, index) => moved(
    box(panelWidth * 0.94, height, Math.max(0.025, depth * 0.05)),
    -width * 0.5 + panelWidth * (index + 0.5),
    height * 0.5,
    depth * 0.51,
  ));
}

function handles(width: number, height: number, depth: number, count: number): Mesh[] {
  return Array.from({ length: count }, (_, index) => moved(
    cylinder(0.014, Math.min(0.18, height * 0.25), 10),
    -width * 0.5 + width * (index + 0.5) / count,
    height * 0.55,
    depth * 0.56,
    Math.PI * 0.5,
  ));
}

function frame(width: number, height: number, depth: number, thickness: number): Mesh[] {
  return [
    moved(box(thickness, height, depth), -width * 0.5 + thickness * 0.5, height * 0.5, 0),
    moved(box(thickness, height, depth), width * 0.5 - thickness * 0.5, height * 0.5, 0),
    moved(box(width, thickness, depth), 0, thickness * 0.5, 0),
    moved(box(width, thickness, depth), 0, height - thickness * 0.5, 0),
  ];
}

function anchorPosition(type: InteriorAnchorType, params: InteriorSystemParams): [number, number, number] {
  if (type === "floor") return [0, 0, 0];
  if (type === "ceiling") return [0, params.height, 0];
  if (type === "wall") return [0, params.height * 0.5, -params.depth * 0.5];
  if (type === "countertop") return [0, params.height, 0];
  if (type === "plumbing") return [0, Math.min(0.55, params.height * 0.5), -params.depth * 0.5];
  if (type === "electrical") return [params.width * 0.25, Math.min(0.45, params.height * 0.5), -params.depth * 0.5];
  if (type === "connection-left") return [-params.width * 0.5, params.height * 0.5, 0];
  return [params.width * 0.5, params.height * 0.5, 0];
}

function attachModelMetadata(parts: NamedPart[], definition: InteriorSystemDefinition, params: InteriorSystemParams): NamedPart[] {
  const anchors = definition.anchors.map((type) => ({ type, position: anchorPosition(type, params) }));
  return parts.map((entry) => ({
    ...entry,
    metadata: {
      ...entry.metadata,
      family: definition.category,
      kind: definition.kind,
      anchors,
      lod: params.detail >= 0.5 ? "high" : "preview",
      deterministic: true,
    },
  }));
}

function buildKitchen(params: InteriorSystemParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const thickness = Math.min(width, height) * 0.045;
  if (kind === "corner-cabinet") {
    const arm = Math.max(width, depth) * 0.58;
    const body = [
      moved(box(width, height, arm), 0, height * 0.5, -depth * 0.5 + arm * 0.5),
      moved(box(arm, height, depth - arm), -width * 0.5 + arm * 0.5, height * 0.5, arm * 0.5),
    ];
    return [
      part("corner_carcass", "转角柜体", body, WOOD, "cabinet", "wood"),
      part("corner_fronts", "转角柜门", [
        moved(box(width * 0.44, height * 0.76, thickness), width * 0.23, height * 0.48, depth * 0.5),
        moved(box(thickness, height * 0.76, depth * 0.44), -width * 0.5, height * 0.48, depth * 0.23),
      ], PAINT, "front", "wood"),
      part("corner_countertop", "L 型台面", [
        moved(box(width * 1.04, thickness * 1.5, arm * 1.04), 0, height + thickness * 0.75, -depth * 0.5 + arm * 0.5),
        moved(box(arm * 1.04, thickness * 1.5, depth - arm), -width * 0.5 + arm * 0.5, height + thickness * 0.75, arm * 0.5),
      ], STONE, "countertop", "stone"),
    ];
  }
  if (kind === "kitchen-island") {
    const moduleCount = Math.max(2, count);
    const fronts = cabinetFronts(width * 0.92, height * 0.7, depth * 0.82, moduleCount).map((mesh) => moved(mesh, 0, height * 0.08, 0));
    const sinkWidth = Math.min(width * 0.28, 0.68);
    const sinkDepth = Math.min(depth * 0.46, 0.5);
    const sideWidth = (width - sinkWidth) * 0.5;
    const endDepth = (depth - sinkDepth) * 0.5;
    const countertop = params.detail >= 0.5
      ? [
          moved(box(sideWidth, thickness * 1.6, depth), -(sinkWidth + sideWidth) * 0.5, height, 0),
          moved(box(sideWidth, thickness * 1.6, depth), (sinkWidth + sideWidth) * 0.5, height, 0),
          moved(box(sinkWidth, thickness * 1.6, endDepth), 0, height, -(sinkDepth + endDepth) * 0.5),
          moved(box(sinkWidth, thickness * 1.6, endDepth), 0, height, (sinkDepth + endDepth) * 0.5),
        ]
      : [moved(box(width, thickness * 1.6, depth), 0, height, 0)];
    const parts = [
      part("island_body", "岛台柜体", moved(box(width * 0.92, height * 0.86, depth * 0.82), 0, height * 0.43, 0), WOOD, "cabinet", "wood"),
      part("island_fronts", "岛台门板", fronts, PAINT, "front", "wood"),
      part("island_countertop", "带开孔岛台台面", countertop, STONE, "countertop", "stone"),
    ];
    if (params.detail >= 0.5) {
      parts.push(
        part("island_sink", "岛台水槽", [
          moved(box(sinkWidth * 0.88, thickness * 0.5, sinkDepth * 0.82), 0, height - thickness * 1.35, 0),
          moved(box(sinkWidth * 0.88, thickness * 1.6, thickness * 0.45), 0, height - thickness * 0.5, -sinkDepth * 0.41),
          moved(box(sinkWidth * 0.88, thickness * 1.6, thickness * 0.45), 0, height - thickness * 0.5, sinkDepth * 0.41),
          moved(box(thickness * 0.45, thickness * 1.6, sinkDepth * 0.82), -sinkWidth * 0.44, height - thickness * 0.5, 0),
          moved(box(thickness * 0.45, thickness * 1.6, sinkDepth * 0.82), sinkWidth * 0.44, height - thickness * 0.5, 0),
        ], STEEL, "plumbing", "metal"),
        part("island_outlets", "岛台电源模块", moved(box(width * 0.11, thickness * 0.4, depth * 0.13), width * 0.25, height + thickness, 0), METAL, "electrical", "metal"),
      );
    }
    return parts;
  }
  const wallMounted = kind === "wall-cabinet";
  const baseY = wallMounted ? height * 0.52 : 0;
  const bodyHeight = wallMounted ? height * 0.48 : height;
  const doorCount = Math.max(1, count);
  const shell = cabinetShell(width, bodyHeight, depth, thickness).map((mesh) => moved(mesh, 0, baseY, 0));
  const fronts = cabinetFronts(width - thickness * 2, bodyHeight - thickness * 2, depth, doorCount).map((mesh) => moved(mesh, 0, baseY + thickness, 0));
  const result = [
    part("cabinet_shell", wallMounted ? "吊柜框体" : "地柜框体", shell, WOOD, "cabinet", "wood"),
    part("cabinet_fronts", wallMounted ? "吊柜门板" : "地柜门板", fronts, PAINT, "front", "wood"),
    part("cabinet_handles", "柜门拉手", handles(width, bodyHeight, depth, doorCount).map((mesh) => moved(mesh, 0, baseY, 0)), METAL, "hardware", "metal"),
  ];
  if (!wallMounted) {
    result.push(part("cabinet_countertop", "连续台面", moved(box(width * 1.04, thickness * 1.5, depth * 1.04), 0, height, 0), STONE, "countertop", "stone"));
    const plinthHeight = Math.max(thickness, height * 0.1 - thickness * 1.2);
    result.push(part("cabinet_plinth", "柜底踢脚", moved(box(width * 0.9, plinthHeight, thickness * 0.7), 0, thickness * 1.2 + plinthHeight * 0.5, depth * 0.34), DARK_WOOD, "plinth", "wood"));
  }
  return result;
}

function glazingGrid(width: number, height: number, depth: number, columns: number, rows: number): Mesh[] {
  const bar = Math.min(width, height) * 0.025;
  const vertical = Array.from({ length: Math.max(0, columns - 1) }, (_, index) => moved(box(bar, height, depth), -width * 0.5 + width * (index + 1) / columns, height * 0.5, 0));
  const horizontal = Array.from({ length: Math.max(0, rows - 1) }, (_, index) => moved(box(width, bar, depth), 0, height * (index + 1) / rows, 0));
  return [...vertical, ...horizontal];
}

function buildDoorWindow(params: InteriorSystemParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const trim = Math.min(width, height) * 0.055;
  if (kind === "modular-doorway") {
    const transomHeight = height * 0.2;
    const doorHeight = height - transomHeight;
    return [
      part("doorway_frame", "模块门套", frame(width, height, depth, trim), PAINT, "frame", "wood"),
      part("doorway_leaf", "入口门扇", moved(box(width * 0.68, doorHeight - trim * 2, depth * 0.45), -width * 0.13, doorHeight * 0.5, 0), WOOD, "leaf", "wood"),
      part("doorway_transom", "门顶气窗", moved(box(width - trim * 2, transomHeight - trim, depth * 0.18), 0, doorHeight + transomHeight * 0.5, 0), GLASS, "glass", "glass"),
      ...(count > 1 ? [part("doorway_sidelight", "门侧采光窗", moved(box(width * 0.18, doorHeight - trim * 2, depth * 0.18), width * 0.38, doorHeight * 0.5, 0), GLASS, "glass", "glass")] : []),
    ];
  }
  const leafCount = kind === "french-door" ? 2 : Math.max(2, count);
  const innerWidth = width - trim * 2;
  const innerHeight = height - trim * 2;
  const leafWidth = innerWidth / leafCount;
  const leaves: Mesh[] = [];
  const glass: Mesh[] = [];
  const muntins: Mesh[] = [];
  for (let index = 0; index < leafCount; index++) {
    const x = -innerWidth * 0.5 + leafWidth * (index + 0.5);
    const openingDirection = index < leafCount * 0.5 ? -1 : 1;
    const yaw = kind === "sliding-window" ? 0 : params.openness * openingDirection * Math.PI * 0.42;
    const z = kind === "sliding-window" ? (index % 2 === 0 ? -depth * 0.16 : depth * 0.16) : 0;
    const place = (mesh: Mesh, localX: number, localY: number, localZ = 0): Mesh => moved(
      mesh,
      x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
      localY,
      z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ,
      0,
      yaw,
    );
    const leafBar = trim * 0.52;
    const leafDepth = trim * 0.7;
    leaves.push(
      place(box(leafBar, innerHeight, leafDepth), -leafWidth * 0.47, height * 0.5),
      place(box(leafBar, innerHeight, leafDepth), leafWidth * 0.47, height * 0.5),
      place(box(leafWidth * 0.94, leafBar, leafDepth), 0, trim + leafBar * 0.5),
      place(box(leafWidth * 0.94, leafBar, leafDepth), 0, height - trim - leafBar * 0.5),
    );
    glass.push(place(box(leafWidth * 0.82, innerHeight - leafBar * 2, depth * 0.08), 0, height * 0.5, depth * 0.04));
    const rowCount = kind === "french-door" ? Math.max(2, count) : kind === "casement-window" ? 2 : 1;
    for (let row = 1; row < rowCount; row++) {
      muntins.push(place(box(leafWidth * 0.82, leafBar * 0.48, leafDepth * 0.72), 0, trim + innerHeight * row / rowCount, depth * 0.08));
    }
  }
  return [
    part("opening_frame", kind === "french-door" ? "法式门框" : "窗框", frame(width, height, depth, trim), PAINT, "frame", "wood"),
    part("opening_leaves", kind === "french-door" ? "玻璃门扇框" : kind === "sliding-window" ? "推拉窗扇框" : "平开窗扇框", leaves, LIGHT_WOOD, "leaf", "wood"),
    part("opening_glass", kind === "french-door" ? "法式门玻璃" : "窗玻璃", glass, GLASS, "glass", "glass"),
    ...(params.detail >= 0.5 && muntins.length ? [part("opening_muntins", "玻璃分格条", muntins, PAINT, "frame", "wood")] : []),
    part("opening_hardware", kind === "sliding-window" ? "推拉轨道" : "开启执手", kind === "sliding-window"
      ? [moved(box(innerWidth, trim * 0.35, depth), 0, trim, 0), moved(box(innerWidth, trim * 0.35, depth), 0, height - trim, 0)]
      : moved(sphere(trim * 0.22, 10, 7), width * 0.18, height * 0.5, depth * 0.55), METAL, "hardware", "metal"),
  ];
}

function buildAppliance(params: InteriorSystemParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const bevel = Math.min(width, height) * 0.04;
  if (kind === "refrigerator") {
    const doorCount = Math.max(2, count);
    return [
      part("fridge_body", "冰箱机身", moved(box(width, height, depth), 0, height * 0.5, 0), STEEL, "body", "metal"),
      part("fridge_doors", "冰箱门体", cabinetFronts(width - bevel * 2, height * 0.9, depth, doorCount).map((mesh) => moved(mesh, 0, height * 0.05, 0)), WHITE, "front", "metal"),
      part("fridge_handles", "冰箱门把手", handles(width, height, depth, doorCount), METAL, "hardware", "metal"),
      ...(params.detail >= 0.5 ? [part("fridge_vent", "冰箱散热格栅", glazingGrid(width * 0.46, height * 0.08, depth * 0.08, 7, 1).map((mesh) => moved(mesh, 0, height * 0.06, depth * 0.53)), METAL, "vent", "metal")] : []),
    ];
  }
  if (kind === "wall-oven") {
    const knobs = Array.from({ length: count }, (_, index) => moved(cylinder(bevel * 0.42, bevel * 0.38, 12), -width * 0.28 + width * 0.56 * index / Math.max(1, count - 1), height * 0.86, depth * 0.55, Math.PI * 0.5));
    return [
      part("oven_body", "烤箱机身", moved(box(width, height, depth), 0, height * 0.5, 0), METAL, "body", "metal"),
      part("oven_door", "烤箱门", moved(box(width * 0.88, height * 0.62, bevel), 0, height * 0.42, depth * 0.52), SCREEN, "glass", "glass"),
      part("oven_handle", "烤箱门把手", moved(cylinder(bevel * 0.3, width * 0.68, 10), 0, height * 0.7, depth * 0.6, 0, 0, Math.PI * 0.5), STEEL, "hardware", "metal"),
      part("oven_controls", "烤箱控制旋钮", knobs, STEEL, "controls", "metal"),
    ];
  }
  if (kind === "washing-machine") {
    const radius = Math.min(width, height) * 0.27;
    const buttons = Array.from({ length: count }, (_, index) => moved(cylinder(bevel * 0.18, bevel * 0.22, 10), -width * 0.3 + width * 0.6 * index / Math.max(1, count - 1), height * 0.84, depth * 0.54, Math.PI * 0.5));
    return [
      part("washer_body", "洗衣机机身", moved(box(width, height, depth), 0, height * 0.5, 0), WHITE, "body", "metal"),
      part("washer_door_rim", "滚筒舱门", moved(torus(radius, bevel * 0.36, 24, 8), 0, height * 0.46, depth * 0.53, Math.PI * 0.5), STEEL, "hardware", "metal"),
      part("washer_drum", "滚筒观察窗", moved(cylinder(radius * 0.82, bevel * 0.45, 24), 0, height * 0.46, depth * 0.52, Math.PI * 0.5), SCREEN, "glass", "glass"),
      part("washer_controls", "洗衣机控制面板", buttons, METAL, "controls", "metal"),
    ];
  }
  const standCount = Math.max(1, Math.min(2, count));
  const stands = Array.from({ length: standCount }, (_, index) => moved(box(width * 0.035, height * 0.2, depth * 0.35), standCount === 1 ? 0 : (index ? 1 : -1) * width * 0.28, height * 0.1, 0));
  return [
    part("television_frame", "电视边框", moved(box(width, height, depth), 0, height * 0.55, 0), METAL, "frame", "metal"),
    part("television_screen", "显示屏", moved(box(width * 0.94, height * 0.86, depth * 0.12), 0, height * 0.56, depth * 0.52), SCREEN, "screen", "glass"),
    part("television_stand", "电视底座", [...stands, moved(box(width * 0.5, height * 0.035, depth * 0.75), 0, height * 0.02, 0)], STEEL, "hardware", "metal"),
  ];
}

function fourLegMeshes(width: number, height: number, depth: number, thickness: number): Mesh[] {
  return [-1, 1].flatMap((xSide) => [-1, 1].map((zSide) => moved(
    box(thickness, height, thickness),
    xSide * (width * 0.5 - thickness),
    height * 0.5,
    zSide * (depth * 0.5 - thickness),
  )));
}

function buildOffice(params: InteriorSystemParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const thickness = Math.min(width, depth) * 0.055;
  if (kind === "filing-cabinet") {
    const drawerHeight = (height - thickness * 2) / count;
    const drawers = Array.from({ length: count }, (_, index) => moved(box(width - thickness * 2.4, drawerHeight * 0.88, thickness), 0, thickness + drawerHeight * (index + 0.5), depth * 0.52));
    const pulls = Array.from({ length: count }, (_, index) => moved(cylinder(thickness * 0.18, width * 0.28, 10), 0, thickness + drawerHeight * (index + 0.5), depth * 0.58, 0, 0, Math.PI * 0.5));
    return [
      part("filing_shell", "文件柜框体", cabinetShell(width, height, depth, thickness), STEEL, "body", "metal"),
      part("filing_drawers", "文件柜抽屉", drawers, PAINT, "front", "metal"),
      part("filing_handles", "文件柜拉手", pulls, METAL, "hardware", "metal"),
    ];
  }
  if (kind === "conference-table") {
    const seatCount = Math.max(4, count);
    const supports = params.style < 0.5
      ? fourLegMeshes(width * 0.8, height, depth * 0.72, thickness)
      : [moved(box(width * 0.12, height, depth * 0.7), -width * 0.27, height * 0.5, 0), moved(box(width * 0.12, height, depth * 0.7), width * 0.27, height * 0.5, 0)];
    const seats = Array.from({ length: seatCount }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const column = Math.floor(index / 2);
      const columns = Math.ceil(seatCount / 2);
      return moved(box(width * 0.55 / columns, thickness * 0.5, depth * 0.16), -width * 0.28 + width * 0.56 * (column + 0.5) / columns, height * 0.58, side * depth * 0.67);
    });
    return [
      part("conference_top", "会议桌台面", moved(box(width, thickness, depth), 0, height, 0), LIGHT_WOOD, "desktop", "wood"),
      part("conference_supports", "会议桌支撑", supports, DARK_WOOD, "frame", "wood"),
      part("conference_power", "桌面电源舱", moved(box(width * 0.18, thickness * 0.45, depth * 0.16), 0, height + thickness * 0.55, 0), METAL, "hardware", "metal"),
      ...(params.detail >= 0.5 ? [part("conference_seat_guides", "会议座位参考", seats, STEEL, "guide", "metal")] : []),
    ];
  }
  const stationCount = Math.max(1, count);
  const desktopY = height * 0.6;
  const desktops = Array.from({ length: stationCount }, (_, index) => moved(box(width / stationCount * 0.94, thickness, depth), -width * 0.5 + width * (index + 0.5) / stationCount, desktopY, 0));
  const dividers = Array.from({ length: stationCount + 1 }, (_, index) => moved(box(thickness * 0.35, height * 0.38, depth), -width * 0.5 + width * index / stationCount, desktopY + height * 0.19, 0));
  const monitors = Array.from({ length: stationCount }, (_, index) => moved(box(width / stationCount * 0.48, height * 0.24, thickness * 0.45), -width * 0.5 + width * (index + 0.5) / stationCount, desktopY + height * 0.2, -depth * 0.2));
  return [
    part("workstation_desktops", "工位台面", desktops, LIGHT_WOOD, "desktop", "wood"),
    part("workstation_frame", "工位支架", [...fourLegMeshes(width, desktopY, depth, thickness), ...dividers], METAL, "frame", "metal"),
    part("workstation_monitors", "工位显示器", monitors, SCREEN, "screen", "glass"),
    ...(params.detail >= 0.5 ? [part("workstation_cable_ports", "桌面线缆孔", Array.from({ length: stationCount }, (_, index) => moved(torus(thickness * 0.5, thickness * 0.12, 12, 6), -width * 0.5 + width * (index + 0.5) / stationCount, desktopY + thickness * 0.55, depth * 0.3)), METAL, "hardware", "metal")] : []),
  ];
}

function buildArchitecture(params: InteriorSystemParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(2, Math.round(params.count));
  const thickness = Math.min(width, height, depth) * 0.24;
  if (kind === "wall-panel") {
    const studMeshes = Array.from({ length: count + 1 }, (_, index) => moved(box(thickness, height, depth * 0.72), -width * 0.5 + width * index / count, height * 0.5, 0));
    return [
      part("wall_faces", "墙体饰面", [moved(box(width, height, depth * 0.12), 0, height * 0.5, -depth * 0.44), moved(box(width, height, depth * 0.12), 0, height * 0.5, depth * 0.44)], PAINT, "wall", "plaster"),
      part("wall_frame", "墙体龙骨", studMeshes, LIGHT_WOOD, "frame", "wood"),
      part("wall_tracks", "墙体顶底轨", [moved(box(width, thickness, depth * 0.72), 0, thickness * 0.5, 0), moved(box(width, thickness, depth * 0.72), 0, height - thickness * 0.5, 0)], METAL, "frame", "metal"),
    ];
  }
  if (kind === "structural-column") {
    const round = params.style >= 0.5;
    const shaft = round ? cylinder(width * 0.36, height * 0.84, Math.max(8, count * 2)) : box(width * 0.72, height * 0.84, depth * 0.72);
    const rings = params.detail >= 0.5 ? Array.from({ length: count }, (_, index) => moved(round ? cylinder(width * 0.4, thickness * 0.45, Math.max(8, count * 2)) : box(width * 0.82, thickness * 0.45, depth * 0.82), 0, height * 0.08 + height * 0.84 * index / Math.max(1, count - 1), 0)) : [];
    return [
      part("column_shaft", "承重柱身", moved(shaft, 0, height * 0.5, 0), STONE, "structure", "stone"),
      part("column_base", "柱础", moved(box(width, height * 0.08, depth), 0, height * 0.04, 0), STONE, "structure", "stone"),
      part("column_capital", "柱顶", moved(box(width, height * 0.08, depth), 0, height * 0.96, 0), STONE, "structure", "stone"),
      ...(rings.length ? [part("column_bands", "柱身装饰带", rings, PAINT, "trim", "stone")] : []),
    ];
  }
  if (kind === "structural-beam") {
    const nodes = Array.from({ length: count }, (_, index) => moved(box(thickness * 1.8, height * 1.22, depth * 1.25), -width * 0.5 + width * (index + 0.5) / count, height * 0.5, 0));
    return [
      part("beam_body", "结构梁体", moved(box(width, height, depth), 0, height * 0.5, 0), params.style >= 0.5 ? STEEL : DARK_WOOD, "structure", params.style >= 0.5 ? "metal" : "wood"),
      part("beam_nodes", "梁连接节点", nodes, METAL, "hardware", "metal"),
    ];
  }
  if (kind === "gable-roof") {
    const pitch = Math.atan2(height, width * 0.5);
    const slope = Math.hypot(width * 0.5, height);
    const rafters = Array.from({ length: count }, (_, index) => {
      const z = -depth * 0.5 + depth * index / Math.max(1, count - 1);
      return [
        moved(box(slope, thickness, thickness), -width * 0.25, height * 0.5, z, 0, 0, pitch),
        moved(box(slope, thickness, thickness), width * 0.25, height * 0.5, z, 0, 0, -pitch),
      ];
    }).flat();
    return [
      part("roof_cover", "双坡屋面", [
        moved(box(slope * 1.04, thickness * 0.7, depth * 1.04), -width * 0.25, height * 0.52, 0, 0, 0, pitch),
        moved(box(slope * 1.04, thickness * 0.7, depth * 1.04), width * 0.25, height * 0.52, 0, 0, 0, -pitch),
      ], ROOF, "roof", "stone"),
      part("roof_rafters", "屋顶椽条", rafters, DARK_WOOD, "structure", "wood"),
      part("roof_ridge", "屋脊盖条", moved(cylinder(thickness * 0.55, depth * 1.05, 10), 0, height, 0, Math.PI * 0.5), ROOF, "roof", "stone"),
    ];
  }
  const postCount = Math.max(3, count);
  const posts = Array.from({ length: postCount }, (_, index) => moved(box(thickness, height, depth), -width * 0.5 + width * index / (postCount - 1), height * 0.5, 0));
  return [
    part("railing_posts", "栏杆立柱", posts, METAL, "structure", "metal"),
    part("railing_handrail", "栏杆扶手", moved(box(width, thickness * 1.35, depth * 1.3), 0, height, 0), DARK_WOOD, "handrail", "wood"),
    part("railing_rails", "栏杆横档", [moved(box(width, thickness * 0.7, depth), 0, height * 0.34, 0), moved(box(width, thickness * 0.7, depth), 0, height * 0.66, 0)], STEEL, "structure", "metal"),
  ];
}

function normalizedParams(input: Partial<InteriorSystemParams>): InteriorSystemParams {
  const kind = input.kind ?? "base-cabinet";
  const definition = INTERIOR_SYSTEM_MODELS.find((entry) => entry.kind === kind) ?? INTERIOR_SYSTEM_MODELS[0]!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.18, 16),
    height: clamp(input.height ?? definition.defaults.height, 0.18, 12),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.08, 16),
    count: clamp(Math.round(input.count ?? definition.defaults.count), 1, 32),
    openness: clamp(input.openness ?? definition.defaults.openness, 0, 1),
    style: clamp(input.style ?? definition.defaults.style, 0, 2),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

export function buildInteriorSystemParts(input: Partial<InteriorSystemParams> = {}): NamedPart[] {
  const params = normalizedParams(input);
  const definition = INTERIOR_SYSTEM_MODELS.find((entry) => entry.kind === params.kind) ?? INTERIOR_SYSTEM_MODELS[0]!;
  let parts: NamedPart[];
  if (["base-cabinet", "wall-cabinet", "corner-cabinet", "kitchen-island"].includes(params.kind)) parts = buildKitchen(params);
  else if (["casement-window", "sliding-window", "french-door", "modular-doorway"].includes(params.kind)) parts = buildDoorWindow(params);
  else if (["refrigerator", "wall-oven", "washing-machine", "television"].includes(params.kind)) parts = buildAppliance(params);
  else if (["workstation", "conference-table", "filing-cabinet"].includes(params.kind)) parts = buildOffice(params);
  else parts = buildArchitecture(params);
  return attachModelMetadata(parts, definition, params);
}

function transformAnchors(value: unknown, x: number, y: number, z: number, yaw: number): unknown {
  if (!Array.isArray(value)) return value;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const anchor = entry as { position?: unknown };
    if (!Array.isArray(anchor.position) || anchor.position.length < 3) return entry;
    const [px, py, pz] = anchor.position;
    if (typeof px !== "number" || typeof py !== "number" || typeof pz !== "number") return entry;
    return {
      ...entry,
      position: [x + cos * px + sin * pz, y + py, z - sin * px + cos * pz],
    };
  });
}

function placeComponent(
  parts: NamedPart[],
  prefix: string,
  role: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
): NamedPart[] {
  return parts.map((entry) => ({
    ...entry,
    name: `${prefix}_${entry.name}`,
    label: `${role} · ${entry.label ?? entry.name}`,
    mesh: moved(entry.mesh, x, y, z, 0, yaw),
    metadata: {
      ...entry.metadata,
      anchors: transformAnchors(entry.metadata?.anchors, x, y, z, yaw),
      assemblyRole: role,
    },
  }));
}

function normalizedCombinationParams(input: Partial<InteriorCombinationParams>): InteriorCombinationParams {
  const kind = input.kind ?? "single-wall-kitchen";
  const definition = INTERIOR_COMBINATION_MODELS.find((entry) => entry.kind === kind) ?? INTERIOR_COMBINATION_MODELS[0]!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 2.4, 12),
    height: clamp(input.height ?? definition.defaults.height, 2, 4),
    depth: clamp(input.depth ?? definition.defaults.depth, 1.4, 10),
    count: clamp(Math.round(input.count ?? definition.defaults.count), 2, 16),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

function kitchenComponent(
  kind: InteriorSystemKind,
  width: number,
  height: number,
  depth: number,
  count: number,
  detail: number,
): NamedPart[] {
  return buildInteriorSystemParts({ kind, width, height, depth, count, detail });
}

export function buildInteriorCombinationParts(input: Partial<InteriorCombinationParams> = {}): NamedPart[] {
  const params = normalizedCombinationParams(input);
  const parts: NamedPart[] = [];
  const cabinetHeight = Math.min(0.94, params.height * 0.38);
  const wallCabinetHeight = Math.min(0.82, params.height * 0.34);
  const wallCabinetY = Math.min(params.height - wallCabinetHeight, 1.42);
  const baseDepth = 0.62;
  const wallDepth = 0.36;

  const add = (
    role: string,
    kind: InteriorSystemKind,
    width: number,
    height: number,
    depth: number,
    count: number,
    x: number,
    y: number,
    z: number,
    yaw = 0,
  ): void => {
    const prefix = `${params.kind.replaceAll("-", "_")}_${parts.length}`;
    parts.push(...placeComponent(kitchenComponent(kind, width, height, depth, count, params.detail), prefix, role, x, y, z, yaw));
  };
  const addBacksplash = (role: string, width: number, x: number, z: number, yaw = 0): void => {
    const bottom = cabinetHeight + 0.04;
    const top = wallCabinetY + wallCabinetHeight * 0.52;
    const backsplash = part(
      `${params.kind.replaceAll("-", "_")}_backsplash`,
      "吊柜承托防溅板",
      moved(box(width * 0.96, Math.max(0.12, top - bottom), 0.05), 0, (bottom + top) * 0.5, 0),
      PAINT,
      "wall",
      "plaster",
    );
    parts.push(...placeComponent([backsplash], `${params.kind.replaceAll("-", "_")}_${parts.length}`, role, x, 0, z, yaw));
  };

  if (params.kind === "single-wall-kitchen") {
    const applianceWidth = Math.min(0.94, params.width * 0.22);
    const runWidth = params.width - applianceWidth - 0.12;
    const runX = -params.width * 0.5 + runWidth * 0.5;
    const backZ = -params.depth * 0.5 + baseDepth * 0.5;
    addBacksplash("后墙安装面", runWidth, runX, -params.depth * 0.5 + 0.025);
    add("地柜组", "base-cabinet", runWidth, cabinetHeight, baseDepth, params.count, runX, 0, backZ);
    add("吊柜组", "wall-cabinet", runWidth * 0.92, wallCabinetHeight, wallDepth, params.count, runX, wallCabinetY, -params.depth * 0.5 + wallDepth * 0.5);
    add("冷藏模块", "refrigerator", applianceWidth, Math.min(1.95, params.height * 0.82), 0.72, 2, params.width * 0.5 - applianceWidth * 0.5, 0, -params.depth * 0.5 + 0.36);
  } else if (params.kind === "l-shaped-kitchen") {
    const cornerSpan = Math.min(1.05, params.width * 0.26, params.depth * 0.3);
    const joinGap = 0.1;
    const backRun = params.width - cornerSpan - 0.08 - joinGap;
    const sideRun = params.depth - cornerSpan - 0.08 - joinGap;
    const backRunCenter = -params.width * 0.5 + cornerSpan + joinGap + backRun * 0.5;
    const sideRunCenter = -params.depth * 0.5 + cornerSpan + joinGap + sideRun * 0.5;
    const backCount = Math.max(1, Math.ceil(params.count * backRun / (backRun + sideRun)));
    const sideCount = Math.max(1, params.count - backCount);
    addBacksplash("后墙安装面", backRun, backRunCenter, -params.depth * 0.5 + 0.025);
    addBacksplash("侧墙安装面", sideRun, -params.width * 0.5 + 0.025, sideRunCenter, Math.PI * 0.5);
    add("转角模块", "corner-cabinet", cornerSpan, cabinetHeight, cornerSpan, 2, -params.width * 0.5 + cornerSpan * 0.5, 0, -params.depth * 0.5 + cornerSpan * 0.5);
    add("后墙地柜", "base-cabinet", backRun, cabinetHeight, baseDepth, backCount, backRunCenter, 0, -params.depth * 0.5 + baseDepth * 0.5);
    add("侧墙地柜", "base-cabinet", sideRun, cabinetHeight, baseDepth, sideCount, -params.width * 0.5 + baseDepth * 0.5, 0, sideRunCenter, Math.PI * 0.5);
    add("后墙吊柜", "wall-cabinet", backRun, wallCabinetHeight, wallDepth, backCount, backRunCenter, wallCabinetY, -params.depth * 0.5 + wallDepth * 0.5);
    add("侧墙吊柜", "wall-cabinet", sideRun, wallCabinetHeight, wallDepth, sideCount, -params.width * 0.5 + wallDepth * 0.5, wallCabinetY, sideRunCenter, Math.PI * 0.5);
  } else {
    const applianceWidth = Math.min(0.94, params.width * 0.2);
    const runWidth = params.width - applianceWidth - 0.14;
    const runX = -params.width * 0.5 + runWidth * 0.5;
    const backZ = -params.depth * 0.5 + baseDepth * 0.5;
    const islandWidth = Math.min(params.width * 0.58, 3.2);
    const islandDepth = Math.min(1.08, params.depth * 0.3);
    addBacksplash("后墙安装面", runWidth, runX, -params.depth * 0.5 + 0.025);
    add("后墙地柜", "base-cabinet", runWidth, cabinetHeight, baseDepth, Math.max(2, params.count - 2), runX, 0, backZ);
    add("后墙吊柜", "wall-cabinet", runWidth * 0.9, wallCabinetHeight, wallDepth, Math.max(2, params.count - 2), runX, wallCabinetY, -params.depth * 0.5 + wallDepth * 0.5);
    add("冷藏模块", "refrigerator", applianceWidth, Math.min(1.95, params.height * 0.82), 0.72, 2, params.width * 0.5 - applianceWidth * 0.5, 0, -params.depth * 0.5 + 0.36);
    add("中岛模块", "kitchen-island", islandWidth, cabinetHeight, islandDepth, Math.max(2, Math.ceil(params.count * 0.5)), 0, 0, Math.min(0.72, params.depth * 0.18));
  }

  return parts.map((entry) => ({
    ...entry,
    metadata: {
      ...entry.metadata,
      assembly: params.kind,
      assemblyWidth: params.width,
      assemblyDepth: params.depth,
      moduleCount: params.count,
    },
  }));
}
