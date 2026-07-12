/**
 * Procedural furnishing reconstructions inspired by public Sweet Home 3D previews.
 * Only category names and preview silhouettes are referenced; no source mesh data is used.
 */
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

export type SweetHomeFurnishingCategory =
  | "门窗"
  | "柜体"
  | "桌椅"
  | "沙发床具"
  | "厨卫"
  | "建筑构件"
  | "灯具"
  | "户外家具";

export type SweetHomeFurnishingKind =
  | "single-door"
  | "double-door"
  | "sliding-door"
  | "archway"
  | "bay-window"
  | "louver-window"
  | "wardrobe"
  | "bookcase"
  | "tv-console"
  | "kitchen-cabinet"
  | "drawer-chest"
  | "dining-table"
  | "coffee-table"
  | "office-desk"
  | "dining-chair"
  | "armchair"
  | "single-sofa"
  | "double-sofa"
  | "corner-sofa"
  | "bed"
  | "nightstand"
  | "sink"
  | "stove"
  | "bathtub"
  | "toilet"
  | "vanity"
  | "railing"
  | "fence"
  | "fireplace"
  | "colonnade"
  | "canopy"
  | "chandelier"
  | "table-lamp"
  | "wall-lamp"
  | "floor-lamp"
  | "bench"
  | "gazebo"
  | "swing"
  | "pergola";

export interface SweetHomeFurnishingParams {
  kind: SweetHomeFurnishingKind;
  width: number;
  height: number;
  depth: number;
  count: number;
  detail: number;
}

export interface SweetHomeFurnishingDefinition {
  id: string;
  name: string;
  category: SweetHomeFurnishingCategory;
  kind: SweetHomeFurnishingKind;
  sourceName: string;
  countLabel: string;
  defaults: SweetHomeFurnishingParams;
}

const SOURCE_PAGE = "https://www.sweethome3d.com/zh-hans/%e5%85%8d%e8%b4%b9-3d-%e6%a8%a1%e5%9e%8b/";

const WOOD: RGB = [0.46, 0.23, 0.1];
const LIGHT_WOOD: RGB = [0.72, 0.51, 0.28];
const DARK_WOOD: RGB = [0.19, 0.085, 0.04];
const PAINT: RGB = [0.78, 0.77, 0.71];
const WHITE: RGB = [0.9, 0.89, 0.84];
const METAL: RGB = [0.09, 0.105, 0.12];
const STEEL: RGB = [0.42, 0.46, 0.5];
const GLASS: RGB = [0.43, 0.68, 0.75];
const FABRIC: RGB = [0.37, 0.46, 0.54];
const CUSHION: RGB = [0.68, 0.57, 0.45];
const CERAMIC: RGB = [0.86, 0.88, 0.86];
const STONE: RGB = [0.47, 0.44, 0.39];
const WARM_LIGHT: RGB = [1, 0.67, 0.25];

function definition(
  kind: SweetHomeFurnishingKind,
  name: string,
  category: SweetHomeFurnishingCategory,
  sourceName: string,
  countLabel: string,
  width: number,
  height: number,
  depth: number,
  count: number,
): SweetHomeFurnishingDefinition {
  return {
    id: `sweet-home-${kind}`,
    name,
    category,
    kind,
    sourceName,
    countLabel,
    defaults: { kind, width, height, depth, count, detail: 1 },
  };
}

export const SWEET_HOME_FURNISHING_MODELS: SweetHomeFurnishingDefinition[] = [
  definition("single-door", "经典单开门", "门窗", "Single door", "门扇数量", 0.95, 2.1, 0.18, 1),
  definition("double-door", "对称双开门", "门窗", "Double door", "门扇数量", 1.65, 2.2, 0.2, 2),
  definition("sliding-door", "玻璃推拉门", "门窗", "Sliding glass door", "门扇数量", 2.4, 2.15, 0.16, 3),
  definition("archway", "石质拱门", "门窗", "Arched doorway", "拱圈分段", 1.5, 2.5, 0.35, 9),
  definition("bay-window", "三面飘窗", "门窗", "Bay window", "玻璃分格", 2.2, 1.55, 0.7, 3),
  definition("louver-window", "百叶窗", "门窗", "Louvered window", "百叶片数", 1.15, 1.45, 0.16, 9),
  definition("wardrobe", "多门衣柜", "柜体", "Wardrobe", "柜门数量", 2.2, 2.35, 0.62, 4),
  definition("bookcase", "开放书柜", "柜体", "Bookcase", "层板数量", 1.4, 2.05, 0.38, 5),
  definition("tv-console", "低矮电视柜", "柜体", "TV console", "柜门数量", 1.9, 0.62, 0.48, 3),
  definition("kitchen-cabinet", "组合厨柜", "柜体", "Kitchen cabinet", "柜体单元", 2.4, 0.92, 0.62, 4),
  definition("drawer-chest", "高抽屉柜", "柜体", "Drawer chest", "抽屉数量", 0.9, 1.15, 0.5, 5),
  definition("dining-table", "四腿餐桌", "桌椅", "Dining table", "桌腿数量", 1.8, 0.76, 0.95, 4),
  definition("coffee-table", "双层茶几", "桌椅", "Coffee table", "支撑数量", 1.25, 0.46, 0.7, 4),
  definition("office-desk", "带抽屉办公桌", "桌椅", "Office desk", "抽屉数量", 1.55, 0.76, 0.72, 3),
  definition("dining-chair", "木质餐椅", "桌椅", "Dining chair", "靠背横档", 0.48, 0.95, 0.52, 3),
  definition("armchair", "软包扶手椅", "桌椅", "Upholstered armchair", "软垫分段", 0.82, 0.9, 0.82, 3),
  definition("single-sofa", "单人沙发", "沙发床具", "Single sofa", "座位数量", 1.0, 0.84, 0.9, 1),
  definition("double-sofa", "双人沙发", "沙发床具", "Two-seat sofa", "座位数量", 1.75, 0.84, 0.92, 2),
  definition("corner-sofa", "转角组合沙发", "沙发床具", "Corner sofa", "座位数量", 2.75, 0.84, 1.8, 5),
  definition("bed", "双人软包床", "沙发床具", "Double bed", "枕头数量", 1.8, 1.05, 2.15, 2),
  definition("nightstand", "床头柜", "沙发床具", "Nightstand", "抽屉数量", 0.55, 0.58, 0.46, 2),
  definition("sink", "单槽厨房水槽", "厨卫", "Kitchen sink", "水槽数量", 1.0, 0.92, 0.62, 1),
  definition("stove", "四头灶台", "厨卫", "Cooking range", "炉头数量", 0.75, 0.9, 0.65, 4),
  definition("bathtub", "独立浴缸", "厨卫", "Bathtub", "支脚数量", 1.75, 0.62, 0.78, 4),
  definition("toilet", "水箱式马桶", "厨卫", "Toilet", "结构分段", 0.48, 0.82, 0.72, 3),
  definition("vanity", "带镜洗手台", "厨卫", "Bathroom vanity", "柜门数量", 1.05, 1.9, 0.55, 2),
  definition("railing", "连续栏杆", "建筑构件", "Railing", "立柱数量", 3.0, 1.0, 0.12, 8),
  definition("fence", "板条围栏", "建筑构件", "Fence", "围栏板数", 3.2, 1.35, 0.18, 11),
  definition("fireplace", "石质壁炉", "建筑构件", "Fireplace", "装饰分段", 1.45, 1.35, 0.55, 5),
  definition("colonnade", "柱廊", "建筑构件", "Colonnade", "柱子数量", 4.5, 2.8, 0.7, 6),
  definition("canopy", "入口雨棚", "建筑构件", "Entrance canopy", "支撑数量", 2.4, 2.5, 1.25, 4),
  definition("chandelier", "多臂吊灯", "灯具", "Chandelier", "灯臂数量", 1.05, 1.15, 1.05, 6),
  definition("table-lamp", "布罩台灯", "灯具", "Table lamp", "灯罩分段", 0.42, 0.68, 0.42, 12),
  definition("wall-lamp", "弧臂壁灯", "灯具", "Wall lamp", "灯头数量", 0.38, 0.55, 0.48, 1),
  definition("floor-lamp", "落地灯", "灯具", "Floor lamp", "灯头数量", 0.5, 1.75, 0.5, 1),
  definition("bench", "户外长椅", "户外家具", "Garden bench", "座板数量", 1.8, 0.88, 0.65, 5),
  definition("gazebo", "六角凉亭", "户外家具", "Gazebo", "立柱数量", 3.2, 3.1, 3.2, 6),
  definition("swing", "庭院秋千", "户外家具", "Garden swing", "座位数量", 1.8, 2.1, 1.35, 3),
  definition("pergola", "木质花架", "户外家具", "Pergola", "顶梁数量", 3.2, 2.5, 2.3, 7),
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function ovalTorus(radius: number, tube: number, widthScale: number, depthScale: number, x: number, y: number, z: number): Mesh {
  return transform(torus(radius, tube, 24, 8), {
    translate: vec3(x, y, z),
    scale: vec3(widthScale, 1, depthScale),
  });
}

function beamBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thickness: number): Mesh {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  return moved(
    box(thickness, thickness, length),
    (ax + bx) * 0.5,
    (ay + by) * 0.5,
    (az + bz) * 0.5,
    -Math.atan2(dy, horizontal),
    Math.atan2(dx, dz),
  );
}

function part(name: string, label: string, meshes: Mesh | Mesh[], color: RGB, surfaceType = "plastic"): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "metal" ? 0.34 : 0.68 } },
    metadata: { sourceMeshUsed: false, reconstruction: "procedural-reference" },
  };
}

function frame(width: number, height: number, depth: number, thickness: number): Mesh[] {
  return [
    moved(box(thickness, height, depth), -width * 0.5 + thickness * 0.5, height * 0.5, 0),
    moved(box(thickness, height, depth), width * 0.5 - thickness * 0.5, height * 0.5, 0),
    moved(box(width, thickness, depth), 0, height - thickness * 0.5, 0),
  ];
}

function fourLegMeshes(width: number, height: number, depth: number, thickness: number): Mesh[] {
  const inset = thickness * 0.75;
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(
    box(thickness, height, thickness),
    sx * (width * 0.5 - inset),
    height * 0.5,
    sz * (depth * 0.5 - inset),
  )));
}

function panelDoorMeshes(width: number, height: number, depth: number, panels: number, opening = 0): Mesh[] {
  const leafWidth = width / panels;
  return Array.from({ length: panels }, (_, index) => {
    const x = -width * 0.5 + leafWidth * (index + 0.5);
    const angle = opening * (index % 2 === 0 ? -1 : 1);
    return moved(box(leafWidth * 0.94, height, depth), x, height * 0.5, 0, 0, angle, 0);
  });
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

function handles(width: number, height: number, depth: number, count: number): Mesh[] {
  return Array.from({ length: count }, (_, index) => {
    const x = -width * 0.5 + width * (index + 0.5) / count;
    return moved(cylinder(0.018, height * 0.18, 10), x, height * 0.52, depth * 0.52, Math.PI * 0.5);
  });
}

function buildDoorWindow(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const trim = Math.min(width, height) * 0.065;
  if (kind === "archway") {
    const radius = width * 0.5;
    const springY = height - radius;
    const segments = Math.max(5, count);
    const archBlocks = Array.from({ length: segments }, (_, index) => {
      const angle = Math.PI * index / (segments - 1);
      const x = Math.cos(angle) * radius * 0.86;
      const y = springY + Math.sin(angle) * radius * 0.86;
      return moved(box(trim * 1.35, trim * 1.8, depth), x, y, 0, 0, 0, Math.PI * 0.5 - angle);
    });
    return [
      part("arch_supports", "拱门立柱", [
        moved(box(trim * 1.5, springY, depth), -width * 0.5 + trim * 0.75, springY * 0.5, 0),
        moved(box(trim * 1.5, springY, depth), width * 0.5 - trim * 0.75, springY * 0.5, 0),
      ], STONE, "stone"),
      part("arch_ring", "拱门拱圈", archBlocks, LIGHT_WOOD, "stone"),
    ];
  }
  if (kind === "bay-window") {
    const sideWidth = width * 0.3;
    const frontWidth = width * 0.52;
    const sillY = height * 0.08;
    return [
      part("bay_window_frame", "飘窗框架", [
        ...frame(frontWidth, height, depth * 0.08, trim),
        moved(box(sideWidth, trim, depth), -width * 0.31, sillY, 0, 0, -0.55),
        moved(box(sideWidth, trim, depth), width * 0.31, sillY, 0, 0, 0.55),
        moved(box(width * 0.9, trim, depth), 0, height, 0),
      ], PAINT, "wood"),
      part("bay_window_glass", "飘窗玻璃", [
        moved(box(frontWidth - trim * 2, height - trim * 2, 0.025), 0, height * 0.5, depth * 0.42),
        moved(box(sideWidth, height - trim * 2, 0.025), -width * 0.34, height * 0.5, 0, 0, -0.55),
        moved(box(sideWidth, height - trim * 2, 0.025), width * 0.34, height * 0.5, 0, 0, 0.55),
      ], GLASS, "glass"),
      part("bay_window_sill", "飘窗台板", moved(box(width, trim, depth), 0, 0, 0), LIGHT_WOOD, "wood"),
    ];
  }
  if (kind === "louver-window") {
    const slats = Array.from({ length: count }, (_, index) => moved(
      box(width - trim * 2.4, trim * 0.46, depth * 0.72),
      0,
      trim + (height - trim * 2) * (index + 0.5) / count,
      0,
      -0.38,
    ));
    return [
      part("louver_frame", "百叶窗框", [...frame(width, height, depth, trim), moved(box(width, trim, depth), 0, trim * 0.5, 0)], PAINT, "wood"),
      part("louver_slats", "可调百叶片", slats, LIGHT_WOOD, "wood"),
    ];
  }
  const panels = kind === "single-door" ? 1 : kind === "double-door" ? 2 : Math.max(2, count);
  const leaves = panelDoorMeshes(width - trim * 2, height - trim, depth * 0.55, panels, kind === "double-door" ? 0.12 : 0);
  const glazing = kind === "sliding-door";
  return [
    part("door_frame", "门框", [...frame(width, height, depth, trim), moved(box(width, trim, depth), 0, trim * 0.5, 0)], PAINT, "wood"),
    part("door_leaves", glazing ? "推拉玻璃门扇" : "门扇", leaves, glazing ? GLASS : WOOD, glazing ? "glass" : "wood"),
    part("door_hardware", glazing ? "推拉门轨道" : "门把手", glazing
      ? [moved(box(width - trim * 2, trim * 0.35, depth), 0, trim, 0), moved(box(width - trim * 2, trim * 0.35, depth), 0, height - trim, 0)]
      : [moved(sphere(trim * 0.22, 10, 7), width * 0.28, height * 0.48, depth * 0.45)], METAL, "metal"),
  ];
}

function buildCabinet(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const thickness = Math.min(width, height) * 0.045;
  const shell = cabinetShell(width, height, depth, thickness);
  if (kind === "bookcase") {
    const shelves = Array.from({ length: count }, (_, index) => moved(
      box(width - thickness * 2, thickness, depth * 0.92),
      0,
      height * (index + 1) / (count + 1),
      thickness * 0.25,
    ));
    const books = Array.from({ length: count * 4 }, (_, index) => {
      const shelf = Math.floor(index / 4);
      const column = index % 4;
      const cellHeight = height / (count + 1);
      return moved(box(width * 0.13, cellHeight * (0.5 + column * 0.08), depth * 0.34),
        -width * 0.32 + column * width * 0.2,
        shelf * cellHeight + cellHeight * 0.34,
        depth * 0.28);
    });
    return [part("bookcase_shell", "书柜框体", shell, WOOD, "wood"), part("bookcase_shelves", "书柜层板", shelves, LIGHT_WOOD, "wood"), part("display_books", "陈列书籍", books, FABRIC, "paper")];
  }
  if (kind === "drawer-chest") {
    const drawerHeight = (height - thickness * 2) / count;
    const drawers = Array.from({ length: count }, (_, index) => moved(box(width - thickness * 2.5, drawerHeight * 0.88, thickness), 0, thickness + drawerHeight * (index + 0.5), depth * 0.5));
    const pulls = Array.from({ length: count }, (_, index) => moved(cylinder(0.025, width * 0.18, 10), 0, thickness + drawerHeight * (index + 0.5), depth * 0.56, 0, 0, Math.PI * 0.5));
    return [part("drawer_carcass", "抽屉柜框体", shell, WOOD, "wood"), part("drawer_fronts", "抽屉面板", drawers, LIGHT_WOOD, "wood"), part("drawer_pulls", "抽屉拉手", pulls, METAL, "metal")];
  }
  const unitCount = Math.max(2, count);
  const doorHeight = kind === "tv-console" ? height * 0.58 : height - thickness * 2;
  const doors = panelDoorMeshes(width - thickness * 2, doorHeight, thickness, unitCount).map((mesh) => moved(mesh, 0, thickness, depth * 0.5));
  const extras: Mesh[] = [];
  if (kind === "kitchen-cabinet") extras.push(moved(box(width * 1.04, thickness * 1.2, depth * 1.06), 0, height + thickness * 0.6, 0));
  if (kind === "tv-console") extras.push(...fourLegMeshes(width * 0.9, height * 0.18, depth * 0.8, thickness * 0.55));
  if (kind === "wardrobe") extras.push(moved(box(width - thickness * 3, thickness * 0.7, depth * 0.7), 0, height * 0.72, 0));
  return [
    part("cabinet_carcass", kind === "wardrobe" ? "衣柜框体" : kind === "tv-console" ? "电视柜框体" : "厨柜框体", shell, WOOD, "wood"),
    part("cabinet_fronts", kind === "wardrobe" ? "衣柜门板" : "柜门面板", doors, PAINT, "wood"),
    part("cabinet_hardware", "柜体拉手", handles(width, doorHeight, depth, unitCount), METAL, "metal"),
    ...(extras.length ? [part("cabinet_features", kind === "kitchen-cabinet" ? "厨柜台面" : kind === "tv-console" ? "电视柜支脚" : "衣柜挂衣杆", extras, kind === "wardrobe" ? METAL : DARK_WOOD, kind === "wardrobe" ? "metal" : "wood")] : []),
  ];
}

function buildTableChair(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const thickness = Math.min(width, depth) * 0.07;
  if (kind === "dining-chair") {
    const seatY = height * 0.47;
    const backBars = Array.from({ length: Math.max(2, Math.round(params.count)) }, (_, index) => moved(box(thickness * 0.65, height * 0.42, thickness * 0.7), -width * 0.3 + width * 0.6 * index / Math.max(1, Math.round(params.count) - 1), height * 0.75, -depth * 0.42));
    return [
      part("chair_frame", "餐椅腿架", fourLegMeshes(width, seatY, depth, thickness), WOOD, "wood"),
      part("chair_seat", "餐椅座板", moved(box(width, thickness * 1.3, depth), 0, seatY, 0), LIGHT_WOOD, "wood"),
      part("chair_back", "餐椅靠背", [...backBars, moved(box(width, thickness, thickness), 0, height - thickness, -depth * 0.42)], WOOD, "wood"),
    ];
  }
  if (kind === "armchair") return buildSofa({ ...params, kind: "single-sofa", count: 1 });
  const topHeight = kind === "coffee-table" ? height * 0.82 : height;
  const parts: NamedPart[] = [
    part("table_top", kind === "office-desk" ? "办公桌台面" : kind === "coffee-table" ? "茶几台面" : "餐桌台面", moved(box(width, thickness, depth), 0, topHeight, 0), LIGHT_WOOD, "wood"),
    part("table_legs", "桌腿", fourLegMeshes(width, topHeight, depth, thickness), DARK_WOOD, "wood"),
  ];
  if (kind === "coffee-table") parts.push(part("lower_shelf", "茶几下层板", moved(box(width * 0.82, thickness * 0.65, depth * 0.76), 0, height * 0.34, 0), WOOD, "wood"));
  if (kind === "office-desk") {
    const drawers = Math.max(1, Math.round(params.count));
    const drawerMeshes = Array.from({ length: drawers }, (_, index) => moved(box(width * 0.28, height * 0.15, depth * 0.72), width * 0.31, height * (0.68 - index * 0.17), 0));
    parts.push(part("desk_drawers", "办公桌抽屉", drawerMeshes, WOOD, "wood"));
    parts.push(part("desk_handles", "办公桌拉手", handles(width * 0.28, height * 0.45, depth, drawers).map((mesh) => moved(mesh, width * 0.31, height * 0.38, 0)), METAL, "metal"));
  }
  return parts;
}

function buildSofa(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  if (kind === "bed") {
    const pillowCount = Math.max(1, Math.round(params.count));
    const pillows = Array.from({ length: pillowCount }, (_, index) => moved(box(width * 0.7 / pillowCount, height * 0.14, depth * 0.23), -width * 0.35 + width * 0.7 * (index + 0.5) / pillowCount, height * 0.58, -depth * 0.32, -0.12));
    return [
      part("bed_frame", "床架", [moved(box(width, height * 0.16, depth), 0, height * 0.16, 0), moved(box(width, height, depth * 0.08), 0, height * 0.5, -depth * 0.5)], DARK_WOOD, "wood"),
      part("mattress", "床垫", moved(box(width * 0.94, height * 0.22, depth * 0.88), 0, height * 0.38, depth * 0.03), WHITE, "fabric"),
      part("pillows", "枕头", pillows, CUSHION, "fabric"),
    ];
  }
  if (kind === "nightstand") return buildCabinet({ ...params, kind: "drawer-chest" });
  const seats = Math.max(1, Math.round(params.count));
  const seatWidth = width / Math.min(seats, 3);
  const baseDepth = kind === "corner-sofa" ? depth * 0.52 : depth;
  const seatMeshes = Array.from({ length: Math.min(seats, 3) }, (_, index) => moved(box(seatWidth * 0.9, height * 0.2, baseDepth * 0.62), -width * 0.5 + seatWidth * (index + 0.5), height * 0.38, baseDepth * 0.04));
  const backMeshes = Array.from({ length: Math.min(seats, 3) }, (_, index) => moved(box(seatWidth * 0.9, height * 0.56, baseDepth * 0.16), -width * 0.5 + seatWidth * (index + 0.5), height * 0.66, -baseDepth * 0.4, -0.12));
  const parts = [
    part("sofa_base", "沙发底座", moved(box(width, height * 0.25, baseDepth * 0.8), 0, height * 0.22, 0), DARK_WOOD, "wood"),
    part("seat_cushions", "座垫", seatMeshes, FABRIC, "fabric"),
    part("back_cushions", "靠垫", backMeshes, CUSHION, "fabric"),
    part("sofa_arms", "沙发扶手", [moved(box(width * 0.09, height * 0.58, baseDepth * 0.8), -width * 0.455, height * 0.42, 0), moved(box(width * 0.09, height * 0.58, baseDepth * 0.8), width * 0.455, height * 0.42, 0)], FABRIC, "fabric"),
  ];
  if (kind === "corner-sofa") {
    const extension = Math.max(depth - baseDepth, baseDepth * 0.5);
    parts.push(part("corner_extension", "转角贵妃位", [
      moved(box(seatWidth * 0.9, height * 0.25, extension), width * 0.5 - seatWidth * 0.5, height * 0.22, baseDepth * 0.35 + extension * 0.5),
      moved(box(seatWidth * 0.82, height * 0.2, extension * 0.92), width * 0.5 - seatWidth * 0.5, height * 0.39, baseDepth * 0.35 + extension * 0.5),
    ], FABRIC, "fabric"));
  }
  return parts;
}

function buildKitchenBath(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const thickness = Math.min(width, depth) * 0.07;
  if (kind === "sink" || kind === "vanity") {
    const vanityHeight = kind === "vanity" ? height * 0.47 : height;
    const cabinetParts = buildCabinet({ ...params, kind: "kitchen-cabinet", height: vanityHeight, count: kind === "vanity" ? 2 : 1 });
    const basinY = vanityHeight + thickness * 1.4;
    const extra = [
      part("basin", kind === "vanity" ? "洗手盆" : "厨房水槽", [ovalTorus(width * 0.22, thickness * 0.35, 1, depth / width * 1.55, 0, basinY, 0), moved(box(width * 0.38, thickness * 0.4, depth * 0.45), 0, basinY - thickness * 0.55, 0)], CERAMIC, "ceramic"),
      part("basin_interior", "水盆内腔", transform(cylinder(1, thickness * 0.12, 24), {
        translate: vec3(0, basinY - thickness * 0.18, 0),
        scale: vec3(width * 0.19, 1, depth * 0.18),
      }), [0.16, 0.22, 0.23], "ceramic"),
      part("faucet", "水龙头", [moved(cylinder(thickness * 0.16, height * 0.22, 12), 0, basinY + height * 0.11, -depth * 0.22), beamBetween(0, basinY + height * 0.2, -depth * 0.22, 0, basinY + height * 0.2, 0, thickness * 0.22)], STEEL, "metal"),
    ];
    if (kind === "vanity") extra.push(part("vanity_mirror", "洗手台镜面", moved(box(width * 0.78, height * 0.45, thickness * 0.18), 0, height * 0.75, -depth * 0.45), GLASS, "glass"));
    return [...cabinetParts, ...extra];
  }
  if (kind === "stove") {
    const burners = Math.max(2, Math.round(params.count));
    const columns = Math.ceil(Math.sqrt(burners));
    const burnerMeshes = Array.from({ length: burners }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return moved(torus(Math.min(width, depth) * 0.11, thickness * 0.18, 16, 6), -width * 0.28 + column * width * 0.56 / Math.max(1, columns - 1), height + thickness, -depth * 0.22 + row * depth * 0.42);
    });
    return [
      part("range_body", "灶台机身", moved(box(width, height, depth), 0, height * 0.5, 0), PAINT, "metal"),
      part("cooktop", "灶台面板", moved(box(width * 0.96, thickness, depth * 0.96), 0, height, 0), METAL, "metal"),
      part("burners", "炉头", burnerMeshes, STEEL, "metal"),
      part("oven_door", "烤箱门", moved(box(width * 0.72, height * 0.48, thickness * 0.35), 0, height * 0.47, depth * 0.51), GLASS, "glass"),
    ];
  }
  if (kind === "bathtub") {
    return [
      part("tub_shell", "浴缸外壳", [
        moved(box(width, height, thickness), 0, height * 0.5, -depth * 0.5), moved(box(width, height, thickness), 0, height * 0.5, depth * 0.5),
        moved(box(thickness, height, depth), -width * 0.5, height * 0.5, 0), moved(box(thickness, height, depth), width * 0.5, height * 0.5, 0),
        moved(box(width, thickness, depth), 0, thickness * 0.5, 0),
      ], CERAMIC, "ceramic"),
      part("tub_rim", "浴缸沿口", ovalTorus(Math.min(width, depth) * 0.43, thickness * 0.4, width / depth * 0.9, 0.9, 0, height, 0), CERAMIC, "ceramic"),
      part("tub_faucet", "浴缸龙头", moved(cylinder(thickness * 0.22, height * 0.42, 12), width * 0.35, height * 1.08, -depth * 0.34), STEEL, "metal"),
    ];
  }
  return [
    part("toilet_base", "马桶底座", moved(sphere(0.5, 18, 12), 0, height * 0.27, depth * 0.12, 0, 0, 0), CERAMIC, "ceramic"),
    part("toilet_bowl", "马桶坐便器", ovalTorus(width * 0.36, width * 0.095, 0.95, depth / width * 0.7, 0, height * 0.48, depth * 0.08), CERAMIC, "ceramic"),
    part("toilet_tank", "马桶水箱", moved(box(width * 0.78, height * 0.48, depth * 0.32), 0, height * 0.68, -depth * 0.3), CERAMIC, "ceramic"),
  ];
}

function buildArchitecture(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(2, Math.round(params.count));
  const thickness = Math.min(height, width / count) * 0.1;
  if (kind === "fireplace") {
    const openingWidth = width * 0.55;
    return [
      part("fireplace_body", "壁炉石砌主体", [
        moved(box(width * 0.22, height, depth), -width * 0.39, height * 0.5, 0), moved(box(width * 0.22, height, depth), width * 0.39, height * 0.5, 0),
        moved(box(width, height * 0.26, depth), 0, height * 0.87, 0), moved(box(width * 1.12, height * 0.09, depth * 1.12), 0, height, 0),
      ], STONE, "stone"),
      part("firebox", "壁炉火膛", moved(box(openingWidth, height * 0.55, depth * 0.55), 0, height * 0.3, -depth * 0.12), METAL, "metal"),
      part("fire", "炉火", [moved(sphere(width * 0.08, 10, 8), -width * 0.08, height * 0.2, depth * 0.22), moved(sphere(width * 0.1, 10, 8), width * 0.07, height * 0.23, depth * 0.2)], WARM_LIGHT, "emissive"),
    ];
  }
  if (kind === "colonnade") {
    const columns = Array.from({ length: count }, (_, index) => moved(cylinder(thickness * 1.5, height * 0.86, 16), -width * 0.5 + width * index / (count - 1), height * 0.45, 0));
    const capitals = Array.from({ length: count }, (_, index) => moved(box(thickness * 4.5, thickness, depth * 0.72), -width * 0.5 + width * index / (count - 1), height * 0.9, 0));
    return [part("colonnade_columns", "柱廊柱身", columns, STONE, "stone"), part("colonnade_capitals", "柱廊柱头", capitals, LIGHT_WOOD, "stone"), part("colonnade_entablature", "柱廊檐梁", moved(box(width + thickness * 4, height * 0.1, depth), 0, height, 0), STONE, "stone")];
  }
  if (kind === "canopy") {
    const supports = fourLegMeshes(width, height * 0.88, depth, thickness * 1.5);
    return [
      part("canopy_supports", "雨棚支撑", supports, METAL, "metal"),
      part("canopy_roof", "雨棚顶板", moved(box(width, thickness * 1.2, depth), 0, height, 0, 0.08), GLASS, "glass"),
      part("canopy_braces", "雨棚斜撑", [beamBetween(-width * 0.45, height * 0.55, -depth * 0.45, -width * 0.45, height, depth * 0.2, thickness), beamBetween(width * 0.45, height * 0.55, -depth * 0.45, width * 0.45, height, depth * 0.2, thickness)], METAL, "metal"),
    ];
  }
  const posts = Array.from({ length: count }, (_, index) => moved(box(thickness, height, thickness), -width * 0.5 + width * index / (count - 1), height * 0.5, 0));
  if (kind === "fence") {
    const pickets = Array.from({ length: count }, (_, index) => moved(box(width / count * 0.68, height * 0.82, depth), -width * 0.5 + width * (index + 0.5) / count, height * 0.42, 0));
    return [part("fence_posts", "围栏立柱", [posts[0]!, posts.at(-1)!], DARK_WOOD, "wood"), part("fence_pickets", "围栏板条", pickets, LIGHT_WOOD, "wood"), part("fence_rails", "围栏横梁", [moved(box(width, thickness, depth * 0.7), 0, height * 0.25, 0), moved(box(width, thickness, depth * 0.7), 0, height * 0.72, 0)], WOOD, "wood")];
  }
  return [part("railing_posts", "栏杆立柱", posts, METAL, "metal"), part("railing_handline", "栏杆扶手", moved(box(width, thickness * 1.5, depth), 0, height, 0), DARK_WOOD, "wood"), part("railing_lower_rail", "栏杆下横杆", moved(box(width, thickness, depth * 0.7), 0, height * 0.25, 0), METAL, "metal")];
}

function buildLighting(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(1, Math.round(params.count));
  const stem = Math.min(width, depth) * 0.06;
  if (kind === "chandelier") {
    const arms = Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return beamBetween(0, height * 0.48, 0, Math.cos(angle) * width * 0.42, height * 0.32, Math.sin(angle) * depth * 0.42, stem);
    });
    const bulbs = Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return moved(sphere(stem * 1.6, 10, 8), Math.cos(angle) * width * 0.42, height * 0.38, Math.sin(angle) * depth * 0.42);
    });
    return [part("chandelier_chain", "吊灯吊链", moved(cylinder(stem * 0.35, height * 0.55, 10), 0, height * 0.74, 0), METAL, "metal"), part("chandelier_arms", "吊灯灯臂", arms, LIGHT_WOOD, "metal"), part("chandelier_bulbs", "吊灯灯泡", bulbs, WARM_LIGHT, "emissive")];
  }
  if (kind === "wall-lamp") {
    return [part("wall_plate", "壁灯安装盘", moved(cylinder(width * 0.22, depth * 0.12, 16), 0, height * 0.55, -depth * 0.46, Math.PI * 0.5), METAL, "metal"), part("wall_arm", "壁灯灯臂", beamBetween(0, height * 0.55, -depth * 0.42, 0, height * 0.42, depth * 0.18, stem), METAL, "metal"), part("wall_shade", "壁灯灯罩", moved(cylinder(width * 0.34, height * 0.35, 16), 0, height * 0.28, depth * 0.25), WHITE, "fabric"), part("wall_bulb", "壁灯光源", moved(sphere(width * 0.12, 10, 8), 0, height * 0.25, depth * 0.25), WARM_LIGHT, "emissive")];
  }
  const isFloor = kind === "floor-lamp";
  const baseY = height * (isFloor ? 0.44 : 0.38);
  return [
    part("lamp_base", isFloor ? "落地灯底座" : "台灯底座", moved(cylinder(width * 0.34, height * 0.055, 20), 0, height * 0.03, 0), METAL, "metal"),
    part("lamp_stem", isFloor ? "落地灯杆" : "台灯灯杆", moved(cylinder(stem, baseY * 1.8, 12), 0, baseY, 0), isFloor ? METAL : LIGHT_WOOD, isFloor ? "metal" : "wood"),
    part("lamp_shade", "灯罩", moved(cylinder(width * 0.42, height * 0.3, Math.max(12, count)), 0, height * 0.82, 0), WHITE, "fabric"),
    part("lamp_bulb", "灯泡", moved(sphere(width * 0.12, 10, 8), 0, height * 0.75, 0), WARM_LIGHT, "emissive"),
  ];
}

function buildOutdoor(params: SweetHomeFurnishingParams): NamedPart[] {
  const { kind, width, height, depth } = params;
  const count = Math.max(3, Math.round(params.count));
  const thickness = Math.min(width / count, depth) * 0.12;
  if (kind === "bench") {
    const slats = Array.from({ length: count }, (_, index) => moved(box(width, thickness * 0.7, depth / count * 0.72), 0, height * 0.48, -depth * 0.42 + depth * (index + 0.5) / count));
    const backSlats = Array.from({ length: Math.max(3, count - 1) }, (_, index) => moved(box(width, height * 0.07, thickness), 0, height * (0.62 + index * 0.3 / Math.max(2, count - 2)), -depth * 0.45));
    return [part("bench_legs", "长椅支脚", fourLegMeshes(width * 0.88, height * 0.48, depth * 0.72, thickness * 1.5), METAL, "metal"), part("bench_seat", "长椅座板", slats, LIGHT_WOOD, "wood"), part("bench_back", "长椅靠背", backSlats, WOOD, "wood")];
  }
  if (kind === "swing") {
    const frameMeshes = [
      beamBetween(-width * 0.55, 0, -depth * 0.42, -width * 0.42, height, 0, thickness * 1.4), beamBetween(-width * 0.55, 0, depth * 0.42, -width * 0.42, height, 0, thickness * 1.4),
      beamBetween(width * 0.55, 0, -depth * 0.42, width * 0.42, height, 0, thickness * 1.4), beamBetween(width * 0.55, 0, depth * 0.42, width * 0.42, height, 0, thickness * 1.4),
      moved(box(width, thickness * 1.4, thickness * 1.4), 0, height, 0),
    ];
    const ropes = [-1, 1].map((side) => moved(cylinder(thickness * 0.18, height * 0.55, 8), side * width * 0.28, height * 0.68, 0));
    return [part("swing_frame", "秋千支架", frameMeshes, DARK_WOOD, "wood"), part("swing_ropes", "秋千吊绳", ropes, METAL, "metal"), part("swing_seat", "秋千座椅", [moved(box(width * 0.7, thickness, depth * 0.46), 0, height * 0.4, 0), moved(box(width * 0.7, height * 0.34, thickness), 0, height * 0.56, -depth * 0.22)], LIGHT_WOOD, "wood")];
  }
  const posts = fourLegMeshes(width, height * 0.9, depth, thickness * 1.6);
  const beams = Array.from({ length: count }, (_, index) => moved(box(width * 1.06, thickness, thickness), 0, height, -depth * 0.5 + depth * index / (count - 1)));
  if (kind === "gazebo") {
    const radialPosts = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI * 2 * index / 6;
      return moved(cylinder(thickness, height * 0.85, 12), Math.cos(angle) * width * 0.43, height * 0.43, Math.sin(angle) * depth * 0.43);
    });
    const roof = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI * 2 * index / 6;
      return beamBetween(0, height * 1.13, 0, Math.cos(angle) * width * 0.55, height * 0.88, Math.sin(angle) * depth * 0.55, thickness * 1.8);
    });
    const roofPanels = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI * 2 * index / 6;
      const radialAngle = Math.PI * 0.5 - angle;
      return moved(
        box(width * 0.48, thickness * 0.55, depth * 0.62),
        Math.cos(angle) * width * 0.27,
        height,
        Math.sin(angle) * depth * 0.27,
        0.42,
        radialAngle,
      );
    });
    return [part("gazebo_posts", "凉亭立柱", radialPosts, WOOD, "wood"), part("gazebo_roof_frame", "凉亭屋架", roof, DARK_WOOD, "wood"), part("gazebo_roof_cover", "凉亭屋面", roofPanels, PAINT, "wood"), part("gazebo_floor", "凉亭地台", moved(cylinder(width * 0.52, height * 0.06, 6), 0, height * 0.03, 0), LIGHT_WOOD, "wood")];
  }
  return [part("pergola_posts", "花架立柱", posts, WOOD, "wood"), part("pergola_top_beams", "花架顶梁", beams, LIGHT_WOOD, "wood"), part("pergola_side_rails", "花架侧梁", [moved(box(thickness, thickness, depth * 1.08), -width * 0.5, height * 0.9, 0), moved(box(thickness, thickness, depth * 1.08), width * 0.5, height * 0.9, 0)], DARK_WOOD, "wood")];
}

function normalizedParams(input: Partial<SweetHomeFurnishingParams>): SweetHomeFurnishingParams {
  const kind = input.kind ?? "single-door";
  const definition = SWEET_HOME_FURNISHING_MODELS.find((entry) => entry.kind === kind) ?? SWEET_HOME_FURNISHING_MODELS[0]!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.2, 12),
    height: clamp(input.height ?? definition.defaults.height, 0.2, 12),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.08, 12),
    count: clamp(Math.round(input.count ?? definition.defaults.count), 1, 32),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

export function buildSweetHomeFurnishingParts(input: Partial<SweetHomeFurnishingParams> = {}): NamedPart[] {
  const params = normalizedParams(input);
  if (["single-door", "double-door", "sliding-door", "archway", "bay-window", "louver-window"].includes(params.kind)) return buildDoorWindow(params);
  if (["wardrobe", "bookcase", "tv-console", "kitchen-cabinet", "drawer-chest"].includes(params.kind)) return buildCabinet(params);
  if (["dining-table", "coffee-table", "office-desk", "dining-chair", "armchair"].includes(params.kind)) return buildTableChair(params);
  if (["single-sofa", "double-sofa", "corner-sofa", "bed", "nightstand"].includes(params.kind)) return buildSofa(params);
  if (["sink", "stove", "bathtub", "toilet", "vanity"].includes(params.kind)) return buildKitchenBath(params);
  if (["railing", "fence", "fireplace", "colonnade", "canopy"].includes(params.kind)) return buildArchitecture(params);
  if (["chandelier", "table-lamp", "wall-lamp", "floor-lamp"].includes(params.kind)) return buildLighting(params);
  return buildOutdoor(params);
}

export const SWEET_HOME_FURNISHING_SOURCE_PAGE = SOURCE_PAGE;
