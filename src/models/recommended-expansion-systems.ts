import {
  box,
  cylinder,
  merge,
  polyline,
  roundedBox,
  smoothCurve,
  sweep,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { buildBlendReferenceFurnishingParts } from "./blend-reference-furnishings.js";
import { buildCreamSofaParts } from "./cream-sofa.js";
import { buildSweetHomeFurnishingParts } from "./sweet-home-furnishings.js";
import { looseUpholsteredCushion, upholsteredPanel } from "./upholstery.js";

type RGB = [number, number, number];

export type ExpansionCategory =
  | "模块化沙发"
  | "管线网络"
  | "家电内部"
  | "户外建筑"
  | "软装系统"
  | "建筑立面";

export type ExpansionSystemKind =
  | "sofa-straight"
  | "sofa-l-shaped"
  | "sofa-chaise"
  | "sofa-recliner"
  | "utility-water"
  | "utility-duct"
  | "utility-cable"
  | "appliance-refrigerator"
  | "appliance-oven"
  | "appliance-washer"
  | "appliance-dishwasher"
  | "outdoor-deck"
  | "outdoor-pergola"
  | "outdoor-carport"
  | "outdoor-fence"
  | "outdoor-trellis"
  | "soft-curtains"
  | "soft-blinds"
  | "soft-bedding"
  | "soft-rug"
  | "facade-balcony"
  | "facade-cornice"
  | "facade-awning"
  | "facade-rainscreen"
  | "facade-window-array";

export interface ExpansionSystemParams {
  kind: ExpansionSystemKind;
  width: number;
  height: number;
  depth: number;
  count: number;
  openness: number;
  detail: number;
  seed: number;
}

export interface ExpansionSystemDefinition {
  id: string;
  name: string;
  category: ExpansionCategory;
  kind: ExpansionSystemKind;
  countLabel: string;
  defaults: ExpansionSystemParams;
}

export interface UtilityRouteObstacle {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface UtilityRouteRequest {
  start: Vec3;
  end: Vec3;
  obstacles?: readonly UtilityRouteObstacle[];
  clearance?: number;
}

const FABRIC: RGB = [0.7, 0.63, 0.54];
const FABRIC_LIGHT: RGB = [0.88, 0.83, 0.74];
const WOOD: RGB = [0.48, 0.29, 0.14];
const LIGHT_WOOD: RGB = [0.69, 0.5, 0.29];
const DARK_WOOD: RGB = [0.2, 0.11, 0.055];
const WHITE: RGB = [0.9, 0.91, 0.89];
const METAL: RGB = [0.22, 0.25, 0.28];
const STEEL: RGB = [0.48, 0.52, 0.55];
const GLASS: RGB = [0.32, 0.63, 0.74];
const DARK: RGB = [0.04, 0.05, 0.06];
const RED: RGB = [0.72, 0.15, 0.1];
const BLUE: RGB = [0.1, 0.3, 0.72];
const COPPER: RGB = [0.62, 0.3, 0.13];
const GREEN: RGB = [0.24, 0.48, 0.2];
const WALL: RGB = [0.74, 0.73, 0.68];

function definition(
  kind: ExpansionSystemKind,
  name: string,
  category: ExpansionCategory,
  countLabel: string,
  width: number,
  height: number,
  depth: number,
  count: number,
  openness = 0.45,
): ExpansionSystemDefinition {
  return {
    id: `expansion-${kind}`,
    name,
    category,
    kind,
    countLabel,
    defaults: { kind, width, height, depth, count, openness, detail: 1, seed: 73 },
  };
}

export const EXPANSION_SYSTEM_MODELS: ExpansionSystemDefinition[] = [
  definition("sofa-straight", "直排模块沙发", "模块化沙发", "座位模块", 2.8, 0.82, 1.08, 3),
  definition("sofa-l-shaped", "L 型模块沙发", "模块化沙发", "座位模块", 3.2, 0.84, 2.0, 5),
  definition("sofa-chaise", "贵妃榻组合沙发", "模块化沙发", "座位模块", 3.05, 0.82, 1.75, 4),
  definition("sofa-recliner", "可展开躺椅沙发", "模块化沙发", "躺椅模块", 2.65, 0.9, 1.16, 3, 0.55),
  definition("utility-water", "冷热水自动路由网络", "管线网络", "支路数量", 4.2, 2.4, 2.5, 4),
  definition("utility-duct", "矩形风管网络", "管线网络", "送风支路", 4.8, 2.8, 3.2, 4),
  definition("utility-cable", "电缆桥架与线束网络", "管线网络", "线缆数量", 4.5, 2.6, 2.8, 6),
  definition("appliance-refrigerator", "可开启冰箱内部", "家电内部", "层架数量", 0.92, 1.86, 0.7, 4, 0.7),
  definition("appliance-oven", "可开启烤箱腔体", "家电内部", "烤架数量", 0.66, 0.72, 0.64, 3, 0.65),
  definition("appliance-washer", "洗衣机滚筒内部", "家电内部", "滚筒筋条", 0.65, 0.88, 0.66, 6, 0.5),
  definition("appliance-dishwasher", "洗碗机双层碗篮", "家电内部", "碗篮层数", 0.64, 0.86, 0.67, 2, 0.75),
  definition("outdoor-deck", "模块化户外露台", "户外建筑", "铺板数量", 4.8, 0.55, 3.4, 14),
  definition("outdoor-pergola", "模块化木质棚架", "户外建筑", "顶梁数量", 3.6, 2.65, 2.8, 8),
  definition("outdoor-carport", "单坡模块车棚", "户外建筑", "支撑柱数量", 5.4, 2.9, 3.4, 6),
  definition("outdoor-fence", "路径式围栏模块", "户外建筑", "围栏板数量", 4.2, 1.4, 0.22, 14),
  definition("outdoor-trellis", "攀援植物花架", "户外建筑", "格栅数量", 2.8, 2.35, 0.7, 8),
  definition("soft-curtains", "规则褶皱双开窗帘", "软装系统", "褶皱数量", 2.6, 2.35, 0.28, 18, 0.35),
  definition("soft-blinds", "可调角度百叶", "软装系统", "百叶片数量", 1.8, 1.65, 0.18, 18, 0.55),
  definition("soft-bedding", "程序化床品组合", "软装系统", "枕头数量", 1.85, 0.54, 2.18, 4),
  definition("soft-rug", "流苏地毯", "软装系统", "流苏数量", 2.5, 0.04, 1.7, 24),
  definition("facade-balcony", "模块化阳台立面", "建筑立面", "栏杆立柱", 3.2, 2.8, 1.15, 10),
  definition("facade-cornice", "分层建筑檐口", "建筑立面", "檐口层数", 4.5, 0.72, 0.58, 4),
  definition("facade-awning", "入口雨棚立面模块", "建筑立面", "支撑数量", 2.8, 2.7, 1.35, 4),
  definition("facade-rainscreen", "外墙分格雨幕系统", "建筑立面", "立面列数", 5.4, 3.2, 0.42, 7),
  definition("facade-window-array", "重复窗阵列立面", "建筑立面", "窗列数量", 6.4, 3.3, 0.38, 6),
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
  metadata: Record<string, unknown> = {},
): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "metal" ? 0.3 : surfaceType === "fabric" ? 0.86 : 0.66 } },
    metadata: { materialSlot, collision: surfaceType === "fabric" ? "mesh" : "box", proceduralFamily: true, ...metadata },
  };
}

function resolveParams(input: Partial<ExpansionSystemParams>): ExpansionSystemParams {
  const kind = input.kind ?? "sofa-straight";
  const model = EXPANSION_SYSTEM_MODELS.find((entry) => entry.kind === kind) ?? EXPANSION_SYSTEM_MODELS[0]!;
  const defaults = model.defaults;
  return {
    kind,
    width: Math.max(0.08, input.width ?? defaults.width),
    height: Math.max(0.04, input.height ?? defaults.height),
    depth: Math.max(0.08, input.depth ?? defaults.depth),
    count: clamp(Math.round(input.count ?? defaults.count), 1, 32),
    openness: clamp(input.openness ?? defaults.openness, 0, 1),
    detail: clamp(input.detail ?? defaults.detail, 0, 1),
    seed: Math.round(input.seed ?? defaults.seed) >>> 0,
  };
}

function segmentIntersectsRect(start: Vec3, end: Vec3, obstacle: UtilityRouteObstacle, clearance: number): boolean {
  const minX = obstacle.minX - clearance;
  const maxX = obstacle.maxX + clearance;
  const minZ = obstacle.minZ - clearance;
  const maxZ = obstacle.maxZ + clearance;
  const steps = Math.max(2, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / 0.08));
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

function pathClear(points: readonly Vec3[], obstacles: readonly UtilityRouteObstacle[], clearance: number): boolean {
  for (let index = 0; index < points.length - 1; index++) {
    if (obstacles.some((obstacle) => segmentIntersectsRect(points[index]!, points[index + 1]!, obstacle, clearance))) return false;
  }
  return true;
}

function pathLength(points: readonly Vec3[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const first = points[index]!;
    const second = points[index + 1]!;
    length += Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
  }
  return length;
}

export function routeUtilityNetwork(request: UtilityRouteRequest): Vec3[] {
  const clearance = Math.max(0, request.clearance ?? 0.12);
  const obstacles = request.obstacles ?? [];
  const { start, end } = request;
  const candidates: Vec3[][] = [
    [start, vec3(end.x, start.y, start.z), vec3(end.x, end.y, start.z), end],
    [start, vec3(start.x, start.y, end.z), vec3(start.x, end.y, end.z), end],
  ];
  for (const obstacle of obstacles) {
    const detours = [obstacle.minX - clearance, obstacle.maxX + clearance];
    for (const x of detours) candidates.push([start, vec3(x, start.y, start.z), vec3(x, end.y, end.z), end]);
    const zDetours = [obstacle.minZ - clearance, obstacle.maxZ + clearance];
    for (const z of zDetours) candidates.push([start, vec3(start.x, start.y, z), vec3(end.x, end.y, z), end]);
  }
  const clear = candidates.filter((candidate) => pathClear(candidate, obstacles, clearance));
  const pool = clear.length > 0 ? clear : candidates;
  return pool.slice().sort((first, second) => pathLength(first) - pathLength(second))[0]!.filter((point, index, list) => {
    if (index === 0) return true;
    const previous = list[index - 1]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) > 1e-5;
  });
}

function pipeMesh(points: Vec3[], radius: number, detail: number, rounded = true): Mesh {
  const base = polyline(points);
  const curve = rounded && points.length > 2 ? smoothCurve(base, Math.max(2, Math.round(3 + detail * 3))) : base;
  return sweep(curve, { radius, sides: detail >= 0.5 ? 12 : 8, caps: true });
}

function placedExisting(parts: NamedPart[], prefix: string, x: number, y: number, z: number, yaw = 0, metadata: Record<string, unknown> = {}): NamedPart[] {
  return parts.map((entry) => ({
    ...entry,
    name: `${prefix}_${entry.name}`,
    label: `${prefix} · ${entry.label ?? entry.name}`,
    mesh: moved(entry.mesh, x, y, z, 0, yaw),
    metadata: { ...entry.metadata, reusedExistingModel: true, ...metadata },
  }));
}

function sofaParts(params: ExpansionSystemParams): NamedPart[] {
  if (params.kind === "sofa-straight") {
    return placedExisting(buildBlendReferenceFurnishingParts({ kind: "modern-sofa", width: params.width, height: params.height, depth: params.depth, modules: params.count, detail: params.detail }), "直排沙发", 0, 0, 0, 0, { sofaModules: params.count });
  }
  if (params.kind === "sofa-l-shaped") {
    return placedExisting(buildSweetHomeFurnishingParts({ kind: "corner-sofa", width: params.width, height: params.height, depth: params.depth, count: params.count, detail: params.detail }), "L型沙发", 0, 0, 0, 0, { sofaModules: params.count });
  }
  const baseWidth = params.kind === "sofa-chaise" ? params.width * 0.72 : params.width;
  const base = placedExisting(buildCreamSofaParts({ variant: "wrap", width: baseWidth, height: params.height, depth: Math.min(params.depth, params.depth * 0.68) }), "沙发主体", params.kind === "sofa-chaise" ? -params.width * 0.12 : 0, 0, -params.depth * 0.12);
  if (params.kind === "sofa-chaise") {
    const chaiseWidth = params.width * 0.3;
    const chaise = upholsteredPanel(chaiseWidth, params.height * 0.34, params.depth * 0.92, params.height * 0.1);
    const pillow = looseUpholsteredCushion(chaiseWidth * 0.82, params.height * 0.4, params.depth * 0.18, params.height * 0.07);
    return [
      ...base,
      part("chaise_module", "贵妃榻承托模块", moved(chaise, params.width * 0.36, params.height * 0.17, params.depth * 0.02), FABRIC, "fabric", "fabric", { sofaModule: "chaise" }),
      part("chaise_back_pillow", "贵妃榻靠枕", moved(pillow, params.width * 0.36, params.height * 0.62, -params.depth * 0.34, -0.1), FABRIC_LIGHT, "pillow", "fabric"),
    ];
  }
  const footWidth = params.width / Math.max(2, params.count) * 0.72;
  const extension = params.depth * 0.62 * params.openness;
  const angle = -params.openness * 0.22;
  const footrests = Array.from({ length: Math.max(1, Math.min(3, params.count)) }, (_, index) => {
    const x = -params.width * 0.5 + params.width * (index + 0.5) / Math.max(1, Math.min(3, params.count));
    return moved(upholsteredPanel(footWidth, params.height * 0.16, params.depth * 0.46, params.height * 0.06), x, params.height * 0.24 - extension * 0.08, params.depth * 0.35 + extension, angle);
  });
  return [
    ...base,
    part("recliner_footrests", "联动伸展脚托", footrests, FABRIC, "fabric", "fabric", { jointType: "slider-hinge", openness: params.openness }),
  ];
}

function utilityParts(params: ExpansionSystemParams): NamedPart[] {
  const obstacles: UtilityRouteObstacle[] = [
    { id: "service-core", minX: -params.width * 0.12, maxX: params.width * 0.12, minZ: -params.depth * 0.12, maxZ: params.depth * 0.12 },
  ];
  const branchCount = clamp(params.count, 2, 10);
  const start = vec3(-params.width * 0.44, 0.025, -params.depth * 0.36);
  const endpoints = Array.from({ length: branchCount }, (_, index) => vec3(
    params.width * (-0.1 + 0.25 * (index % 3)),
    params.height * (0.34 + 0.46 * (index % 2)),
    -params.depth * 0.32 + params.depth * 0.64 * (index / Math.max(1, branchCount - 1)),
  ));
  const routes = endpoints.map((end) => routeUtilityNetwork({ start, end, obstacles, clearance: 0.16 }));
  if (params.kind === "utility-duct") {
    const ducts = routes.flatMap((route) => route.slice(0, -1).map((point, index) => {
      const next = route[index + 1]!;
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const dz = next.z - point.z;
      const length = Math.hypot(dx, dy, dz);
      const horizontal = Math.hypot(dx, dz);
      return moved(box(params.width * 0.055, params.height * 0.07, length), (point.x + next.x) * 0.5, (point.y + next.y) * 0.5, (point.z + next.z) * 0.5, -Math.atan2(dy, horizontal), Math.atan2(dx, dz));
    }));
    const diffusers = endpoints.map((end) => moved(box(params.width * 0.13, 0.035, params.depth * 0.12), end.x, end.y, end.z));
    return [
      part("duct_routes", "自动路由矩形风管", ducts, STEEL, "duct", "metal", { routeCount: routes.length, router: "orthogonal-obstacle-avoidance" }),
      part("duct_diffusers", "送风散流器", diffusers, WHITE, "diffuser", "metal"),
    ];
  }
  if (params.kind === "utility-cable") {
    const traySegments = [moved(box(params.width * 0.88, 0.045, 0.18), 0, params.height * 0.82, -params.depth * 0.36)];
    const cables = routes.flatMap((route, routeIndex) => Array.from({ length: Math.max(1, Math.round(branchCount / 2)) }, (_, cableIndex) => pipeMesh(route.map((point) => vec3(point.x, point.y + cableIndex * 0.022, point.z + routeIndex * 0.012)), 0.012, params.detail)));
    return [
      part("cable_tray", "模块化电缆桥架", traySegments, STEEL, "tray", "metal"),
      part("routed_cables", "自动避障线束", cables, DARK, "cable", "plastic", { routeCount: routes.length, router: "orthogonal-obstacle-avoidance" }),
    ];
  }
  const hot = routes.filter((_, index) => index % 2 === 0).map((route) => pipeMesh(route, 0.025, params.detail, false));
  const cold = routes.filter((_, index) => index % 2 === 1).map((route) => pipeMesh(route, 0.025, params.detail, false));
  const joints = endpoints.map((end) => moved(torus(0.05, 0.012, 16, 6), end.x, end.y, end.z, Math.PI * 0.5));
  return [
    part("hot_water_routes", "热水自动路由", hot, RED, "hot-water", "metal", { router: "orthogonal-obstacle-avoidance" }),
    part("cold_water_routes", "冷水自动路由", cold, BLUE, "cold-water", "metal", { router: "orthogonal-obstacle-avoidance" }),
    part("pipe_junctions", "弯头与三通接头", joints, COPPER, "fittings", "metal", { junctionType: "elbow-tee" }),
  ];
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

function applianceParts(params: ExpansionSystemParams): NamedPart[] {
  const thickness = Math.max(0.025, Math.min(params.width, params.height, params.depth) * 0.045);
  const shell = cabinetShell(params.width, params.height, params.depth, thickness);
  if (params.kind === "appliance-refrigerator") {
    const shelfCount = clamp(params.count, 2, 7);
    const shelves = Array.from({ length: shelfCount }, (_, index) => moved(box(params.width * 0.82, 0.018, params.depth * 0.72), 0, params.height * (0.17 + index * 0.66 / Math.max(1, shelfCount - 1)), -params.depth * 0.02));
    const drawers = [moved(roundedBox({ width: params.width * 0.78, height: params.height * 0.15, depth: params.depth * 0.6, radius: 0.025, steps: 2 }), 0, params.height * 0.13, 0)];
    const doorWidth = params.width * 0.49;
    const angle = params.openness * Math.PI * 0.62;
    const doors = [-1, 1].map((side) => {
      const pivotX = side * params.width * 0.5;
      const leaf = moved(box(doorWidth, params.height * 0.96, thickness * 1.6), -side * doorWidth * 0.5, params.height * 0.5, 0);
      return moved(leaf, pivotX, 0, params.depth * 0.5, 0, side * angle);
    });
    return [
      part("refrigerator_shell", "冰箱保温壳体", shell, WHITE, "appliance-shell", "metal"),
      part("refrigerator_shelves", "可调玻璃层架", shelves, GLASS, "shelves", "glass", { shelfCount }),
      part("refrigerator_drawers", "保鲜抽屉", drawers, GLASS, "drawers", "plastic"),
      part("refrigerator_doors", "联动双开门", doors, WHITE, "doors", "metal", { jointType: "hinge", openness: params.openness }),
    ];
  }
  if (params.kind === "appliance-oven") {
    const rackCount = clamp(params.count, 1, 5);
    const cavity = moved(box(params.width * 0.8, params.height * 0.62, params.depth * 0.72), 0, params.height * 0.53, 0);
    const racks = Array.from({ length: rackCount }, (_, index) => moved(box(params.width * 0.72, 0.012, params.depth * 0.58), 0, params.height * (0.28 + index * 0.42 / Math.max(1, rackCount - 1)), 0.02));
    const doorAngle = params.openness * Math.PI * 0.48;
    const doorHeight = params.height * 0.42;
    const doorLocal = moved(box(params.width * 0.9, doorHeight, thickness * 1.8), 0, doorHeight * 0.5, 0);
    const door = moved(doorLocal, 0, params.height * 0.06, params.depth * 0.5, -doorAngle);
    return [
      part("oven_shell", "烤箱隔热壳体", shell, METAL, "appliance-shell", "metal"),
      part("oven_cavity", "搪瓷烤箱腔体", cavity, DARK, "cavity", "metal"),
      part("oven_racks", "多层烤架", racks, STEEL, "racks", "metal", { rackCount }),
      part("oven_door", "下翻玻璃门", door, GLASS, "door", "glass", { jointType: "hinge", openness: params.openness }),
    ];
  }
  if (params.kind === "appliance-washer") {
    const drum = moved(cylinder(params.width * 0.34, params.depth * 0.62, params.detail >= 0.5 ? 32 : 18, true), 0, params.height * 0.48, 0, Math.PI * 0.5);
    const ribs = Array.from({ length: clamp(params.count, 3, 12) }, (_, index) => moved(box(params.width * 0.035, params.width * 0.42, params.depth * 0.5), Math.cos(index / params.count * Math.PI * 2) * params.width * 0.25, params.height * 0.48 + Math.sin(index / params.count * Math.PI * 2) * params.width * 0.25, 0, 0, 0, index / params.count * Math.PI * 2));
    const doorAngle = params.openness * Math.PI * 0.7;
    const doorRadius = params.width * 0.28;
    const doorLocal = moved(torus(doorRadius, params.width * 0.045, 28, 8), doorRadius, 0, 0, Math.PI * 0.5);
    const door = moved(doorLocal, -doorRadius, params.height * 0.48, params.depth * 0.52, 0, -doorAngle);
    return [
      part("washer_shell", "洗衣机结构壳体", shell, WHITE, "appliance-shell", "metal"),
      part("washer_drum", "不锈钢滚筒", drum, STEEL, "drum", "metal"),
      part("washer_drum_ribs", "滚筒提升筋", ribs, STEEL, "drum-ribs", "metal"),
      part("washer_door", "可开启舱门", door, GLASS, "door", "glass", { jointType: "hinge", openness: params.openness }),
    ];
  }
  const rackCount = clamp(params.count, 1, 3);
  const racks = Array.from({ length: rackCount }, (_, index) => {
    const y = params.height * (0.32 + index * 0.34);
    const frame = moved(box(params.width * 0.78, 0.025, params.depth * 0.62), 0, y, 0);
    const tines = Array.from({ length: 8 }, (_, tineIndex) => moved(cylinder(0.009, params.height * 0.16, 8, true), -params.width * 0.34 + tineIndex * params.width * 0.095, y + params.height * 0.08, 0));
    return [frame, ...tines];
  }).flat();
  const doorHeight = params.height * 0.72;
  const doorLocal = moved(box(params.width * 0.92, doorHeight, thickness * 1.8), 0, doorHeight * 0.5, 0);
  const door = moved(doorLocal, 0, params.height * 0.04, params.depth * 0.5, -params.openness * Math.PI * 0.48);
  return [
    part("dishwasher_shell", "洗碗机不锈钢内胆", shell, STEEL, "appliance-shell", "metal"),
    part("dishwasher_racks", "双层滑轨碗篮", racks, STEEL, "racks", "metal", { rackCount, jointType: "slider" }),
    part("dishwasher_door", "下翻操作门", door, WHITE, "door", "metal", { jointType: "hinge", openness: params.openness }),
  ];
}

function outdoorParts(params: ExpansionSystemParams): NamedPart[] {
  if (params.kind === "outdoor-pergola") {
    return placedExisting(buildSweetHomeFurnishingParts({ kind: "pergola", width: params.width, height: params.height, depth: params.depth, count: params.count, detail: params.detail }), "模块棚架", 0, 0, 0);
  }
  if (params.kind === "outdoor-fence") {
    return placedExisting(buildSweetHomeFurnishingParts({ kind: "fence", width: params.width, height: params.height, depth: params.depth, count: params.count, detail: params.detail }), "路径围栏", 0, 0, 0);
  }
  if (params.kind === "outdoor-deck") {
    const boardCount = clamp(params.count, 5, 28);
    const boardWidth = params.width / boardCount;
    const boards = Array.from({ length: boardCount }, (_, index) => moved(box(boardWidth * 0.9, params.height * 0.12, params.depth), -params.width * 0.5 + boardWidth * (index + 0.5), params.height * 0.58, 0));
    const joists = Array.from({ length: 5 }, (_, index) => moved(box(params.width, params.height * 0.12, params.depth * 0.045), 0, params.height * 0.42, -params.depth * 0.45 + index * params.depth * 0.225));
    const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(box(params.width * 0.055, params.height * 0.8, params.width * 0.055), sx * params.width * 0.44, params.height * 0.2, sz * params.depth * 0.42)));
    return [
      part("deck_boards", "顺纹露台铺板", boards, LIGHT_WOOD, "decking", "wood", { boardCount }),
      part("deck_subframe", "露台龙骨与基础柱", [...joists, ...posts], DARK_WOOD, "subframe", "wood"),
    ];
  }
  if (params.kind === "outdoor-carport") {
    const columns = [-1, 1].flatMap((sx) => [-1, 1, 0].map((sz) => moved(box(params.width * 0.045, params.height * 0.82, params.width * 0.045), sx * params.width * 0.45, params.height * 0.41, sz * params.depth * 0.42)));
    const beams = [-1, 1].map((sx) => moved(box(params.width * 0.06, params.height * 0.08, params.depth * 0.94), sx * params.width * 0.45, params.height * 0.84, 0));
    const roof = moved(box(params.width * 0.98, params.height * 0.055, params.depth), 0, params.height * 0.92, 0, 0, 0, -0.08);
    const braces = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(box(params.width * 0.035, params.height * 0.04, params.depth * 0.24), sx * params.width * 0.38, params.height * 0.73, sz * params.depth * 0.32, 0, sx * sz * 0.55)));
    return [
      part("carport_frame", "车棚柱梁框架", [...columns, ...beams, ...braces], METAL, "frame", "metal"),
      part("carport_roof", "单坡金属屋面", roof, STEEL, "roof", "metal", { roofType: "mono-pitch" }),
    ];
  }
  const count = clamp(params.count, 4, 16);
  const vertical = Array.from({ length: count }, (_, index) => moved(box(params.width * 0.025, params.height * 0.72, params.depth * 0.08), -params.width * 0.44 + index * params.width * 0.88 / Math.max(1, count - 1), params.height * 0.58, 0));
  const horizontalCount = Math.max(3, Math.round(count * 0.65));
  const horizontal = Array.from({ length: horizontalCount }, (_, index) => moved(box(params.width * 0.9, params.height * 0.018, params.depth * 0.08), 0, params.height * 0.24 + index * params.height * 0.68 / Math.max(1, horizontalCount - 1), 0));
  const planter = moved(roundedBox({ width: params.width, height: params.height * 0.22, depth: params.depth, radius: 0.04, steps: 2 }), 0, params.height * 0.11, 0);
  const vines = Array.from({ length: Math.max(3, Math.round(count * 0.6)) }, (_, index) => pipeMesh([
    vec3(-params.width * 0.4 + index * params.width * 0.8 / Math.max(1, count - 1), params.height * 0.2, 0.06),
    vec3(-params.width * 0.35 + index * params.width * 0.72 / Math.max(1, count - 1), params.height * 0.62, 0.05),
    vec3(-params.width * 0.28 + index * params.width * 0.58 / Math.max(1, count - 1), params.height * 0.94, 0.04),
  ], 0.018, params.detail));
  return [
    part("trellis_planter", "一体式花槽", planter, WOOD, "planter", "wood"),
    part("trellis_grid", "攀援格栅", [...vertical, ...horizontal], LIGHT_WOOD, "trellis", "wood", { gridCount: count }),
    part("trellis_vines", "程序化攀援藤蔓", vines, GREEN, "foliage", "foliage"),
  ];
}

function softParts(params: ExpansionSystemParams): NamedPart[] {
  if (params.kind === "soft-curtains") {
    const folds = clamp(params.count, 6, 28);
    const openGap = params.width * params.openness * 0.42;
    const panelWidth = (params.width - openGap) * 0.5;
    const foldWidth = panelWidth / folds;
    const panels = [-1, 1].flatMap((side) => Array.from({ length: folds }, (_, index) => {
      const xBase = side * (openGap * 0.5 + foldWidth * (index + 0.5));
      const z = Math.sin(index * Math.PI) * params.depth * 0.14 + (index % 2 === 0 ? params.depth * 0.1 : -params.depth * 0.1);
      const height = params.height * (0.96 - 0.012 * Math.sin(index * 1.7));
      return moved(roundedBox({ width: foldWidth * 1.22, height, depth: params.depth * 0.34, radius: Math.min(foldWidth, params.depth) * 0.16, steps: 2 }), xBase, height * 0.5, z);
    }));
    const rod = moved(cylinder(params.depth * 0.09, params.width * 1.08, 18, true), 0, params.height * 1.02, 0, 0, 0, Math.PI * 0.5);
    return [
      part("curtain_panels", "规则褶皱双开帘", panels, FABRIC, "curtain", "fabric", { folds, openness: params.openness }),
      part("curtain_rod", "窗帘轨道与端头", rod, METAL, "hardware", "metal"),
    ];
  }
  if (params.kind === "soft-blinds") {
    const slats = clamp(params.count, 6, 32);
    const angle = (params.openness - 0.5) * Math.PI * 0.9;
    const slatHeight = params.height / slats;
    const meshes = Array.from({ length: slats }, (_, index) => moved(box(params.width, slatHeight * 0.12, params.depth * 0.62), 0, slatHeight * (index + 0.5), 0, angle));
    const cords = [-0.34, 0.34].map((side) => moved(cylinder(params.width * 0.004, params.height, 8, true), side * params.width, params.height * 0.5, params.depth * 0.08));
    return [
      part("blind_slats", "联动可调百叶片", meshes, LIGHT_WOOD, "slats", "wood", { slats, jointType: "linked-hinge", openness: params.openness }),
      part("blind_cords", "百叶升降绳", cords, DARK, "cord", "fabric"),
    ];
  }
  if (params.kind === "soft-bedding") {
    const mattress = moved(upholsteredPanel(params.width, params.height * 0.42, params.depth, params.height * 0.12), 0, params.height * 0.21, 0);
    const duvet = moved(upholsteredPanel(params.width * 0.94, params.height * 0.24, params.depth * 0.72, params.height * 0.1), 0, params.height * 0.5, params.depth * 0.12, -0.04);
    const pillowCount = clamp(params.count, 2, 6);
    const pillows = Array.from({ length: pillowCount }, (_, index) => moved(looseUpholsteredCushion(params.width * 0.36, params.height * 0.32, params.depth * 0.18, params.height * 0.08), -params.width * 0.34 + index * params.width * 0.68 / Math.max(1, pillowCount - 1), params.height * 0.63, -params.depth * 0.36, -0.12));
    return [
      part("bedding_mattress", "软包床垫", mattress, WHITE, "mattress", "fabric"),
      part("bedding_duvet", "自然垂坠被面", duvet, FABRIC_LIGHT, "duvet", "fabric"),
      part("bedding_pillows", "组合睡枕", pillows, WHITE, "pillows", "fabric", { pillowCount }),
    ];
  }
  const rug = moved(roundedBox({ width: params.width, height: params.height, depth: params.depth, radius: Math.min(params.width, params.depth) * 0.035, steps: 2 }), 0, params.height * 0.5, 0);
  const fringeCount = clamp(params.count, 8, 32);
  const fringes = [-1, 1].flatMap((side) => Array.from({ length: fringeCount }, (_, index) => moved(cylinder(params.height * 0.14, params.depth * 0.08, 6, true), -params.width * 0.46 + index * params.width * 0.92 / Math.max(1, fringeCount - 1), params.height * 0.4, side * params.depth * 0.53, Math.PI * 0.5)));
  return [
    part("rug_body", "低绒地毯主体", rug, FABRIC, "rug", "fabric"),
    part("rug_fringe", "双侧规则流苏", fringes, FABRIC_LIGHT, "fringe", "fabric", { fringeCount }),
  ];
}

function facadeParts(params: ExpansionSystemParams): NamedPart[] {
  if (params.kind === "facade-awning") {
    return placedExisting(buildSweetHomeFurnishingParts({ kind: "canopy", width: params.width, height: params.height, depth: params.depth, count: params.count, detail: params.detail }), "入口雨棚", 0, 0, 0);
  }
  if (params.kind === "facade-balcony") {
    const slab = moved(box(params.width, params.height * 0.08, params.depth), 0, params.height * 0.12, params.depth * 0.18);
    const wall = moved(box(params.width, params.height, params.depth * 0.08), 0, params.height * 0.5, -params.depth * 0.46);
    const door = moved(box(params.width * 0.38, params.height * 0.72, params.depth * 0.045), 0, params.height * 0.4, -params.depth * 0.4);
    const railCount = clamp(params.count, 4, 20);
    const rails = Array.from({ length: railCount }, (_, index) => moved(box(params.width * 0.018, params.height * 0.36, params.depth * 0.018), -params.width * 0.46 + index * params.width * 0.92 / Math.max(1, railCount - 1), params.height * 0.34, params.depth * 0.62));
    const handrail = moved(box(params.width * 0.96, params.height * 0.025, params.depth * 0.035), 0, params.height * 0.53, params.depth * 0.62);
    return [
      part("balcony_wall", "阳台承载墙体", wall, WALL, "wall", "plaster"),
      part("balcony_door", "阳台玻璃门", door, GLASS, "glazing", "glass"),
      part("balcony_slab", "悬挑阳台板", slab, WALL, "slab", "concrete"),
      part("balcony_railing", "模块化阳台栏杆", [...rails, handrail], METAL, "railing", "metal", { railCount }),
    ];
  }
  if (params.kind === "facade-cornice") {
    const layers = clamp(params.count, 2, 8);
    const profiles = Array.from({ length: layers }, (_, index) => moved(box(params.width * (1 - index * 0.015), params.height / layers * 0.72, params.depth * (0.45 + index * 0.55 / Math.max(1, layers - 1))), 0, params.height * (index + 0.5) / layers, -params.depth * 0.12 + index * params.depth * 0.04));
    const dentilCount = Math.max(5, layers * 4);
    const dentils = Array.from({ length: dentilCount }, (_, index) => moved(box(params.width * 0.035, params.height * 0.18, params.depth * 0.28), -params.width * 0.46 + index * params.width * 0.92 / Math.max(1, dentilCount - 1), params.height * 0.18, params.depth * 0.38));
    return [
      part("cornice_profiles", "分层檐口线脚", profiles, WALL, "cornice", "plaster", { layers }),
      part("cornice_dentils", "檐口齿饰阵列", dentils, WALL, "dentils", "plaster"),
    ];
  }
  const columns = clamp(params.count, 3, 14);
  const wall = moved(box(params.width, params.height, params.depth * 0.28), 0, params.height * 0.5, -params.depth * 0.28);
  if (params.kind === "facade-rainscreen") {
    const panelWidth = params.width / columns;
    const rows = Math.max(2, Math.round(columns * 0.55));
    const panelHeight = params.height / rows;
    const panels = Array.from({ length: columns * rows }, (_, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return moved(box(panelWidth * 0.9, panelHeight * 0.88, params.depth * 0.09), -params.width * 0.5 + panelWidth * (col + 0.5), panelHeight * (row + 0.5), params.depth * 0.02);
    });
    const rails = Array.from({ length: columns + 1 }, (_, index) => moved(box(params.width * 0.012, params.height, params.depth * 0.1), -params.width * 0.5 + index * params.width / columns, params.height * 0.5, -params.depth * 0.05));
    return [
      part("rainscreen_wall", "立面基层墙体", wall, WALL, "wall", "concrete"),
      part("rainscreen_panels", "通风雨幕分格板", panels, STEEL, "panels", "metal", { columns, rows }),
      part("rainscreen_rails", "雨幕竖向龙骨", rails, DARK, "rails", "metal"),
    ];
  }
  const rows = Math.max(1, Math.round(columns * 0.36));
  const bayWidth = params.width / columns;
  const bayHeight = params.height / rows;
  const windows = Array.from({ length: columns * rows }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return moved(box(bayWidth * 0.64, bayHeight * 0.55, params.depth * 0.045), -params.width * 0.5 + bayWidth * (col + 0.5), bayHeight * (row + 0.55), params.depth * 0.01);
  });
  const mullions = Array.from({ length: columns + 1 }, (_, index) => moved(box(params.width * 0.012, params.height, params.depth * 0.08), -params.width * 0.5 + index * params.width / columns, params.height * 0.5, params.depth * 0.08));
  const sills = Array.from({ length: rows }, (_, index) => moved(box(params.width, params.height * 0.018, params.depth * 0.14), 0, bayHeight * (index + 0.22), params.depth * 0.09));
  return [
    part("window_array_wall", "重复窗阵列墙体", wall, WALL, "wall", "concrete"),
    part("window_array_glazing", "规则窗阵列玻璃", windows, GLASS, "glazing", "glass", { columns, rows }),
    part("window_array_frames", "连续窗框与窗台", [...mullions, ...sills], METAL, "frames", "metal"),
  ];
}

export function buildExpansionSystemParts(input: Partial<ExpansionSystemParams> = {}): NamedPart[] {
  const params = resolveParams(input);
  if (params.kind.startsWith("sofa-")) return sofaParts(params);
  if (params.kind.startsWith("utility-")) return utilityParts(params);
  if (params.kind.startsWith("appliance-")) return applianceParts(params);
  if (params.kind.startsWith("outdoor-")) return outdoorParts(params);
  if (params.kind.startsWith("soft-")) return softParts(params);
  return facadeParts(params);
}
