/** Parametric furnishing archetypes learned from the local Blender reference library. */
import {
  box,
  computeNormals,
  cylinder,
  lathe,
  merge,
  polyline,
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
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  continuousTuftedPad,
  looseUpholsteredCushion,
  upholsteredPanel,
} from "./upholstery.js";

type RGB = [number, number, number];

export type BlendReferenceFurnishingKind =
  | "modern-sofa"
  | "armchair"
  | "ottoman"
  | "dining-table"
  | "dining-chair"
  | "coffee-table"
  | "cabinet"
  | "refrigerator"
  | "washing-machine"
  | "desktop-monitor"
  | "wall-air-conditioner"
  | "keyboard"
  | "pendant-lamp"
  | "wine-bottle"
  | "chinese-ornament"
  | "indoor-plant";

export interface BlendReferenceFurnishingParams {
  kind: BlendReferenceFurnishingKind;
  width: number;
  height: number;
  depth: number;
  modules: number;
  detail: number;
  seed: number;
  primaryColor: RGB;
  accentColor: RGB;
}

export interface BlendReferenceFurnishingDefinition {
  id: string;
  name: string;
  sourceCategory: string;
  defaults: BlendReferenceFurnishingParams;
}

const FABRIC: RGB = [0.72, 0.68, 0.61];
const WOOD: RGB = [0.42, 0.24, 0.12];
const DARK: RGB = [0.08, 0.09, 0.1];
const METAL: RGB = [0.28, 0.3, 0.32];
const WHITE: RGB = [0.82, 0.84, 0.84];
const GREEN: RGB = [0.19, 0.42, 0.2];

function definition(
  kind: BlendReferenceFurnishingKind,
  name: string,
  sourceCategory: string,
  width: number,
  height: number,
  depth: number,
  modules: number,
  primaryColor: RGB,
  accentColor: RGB,
): BlendReferenceFurnishingDefinition {
  return {
    id: `blend-ref-${kind}`,
    name,
    sourceCategory,
    defaults: { kind, width, height, depth, modules, detail: 1, seed: 31, primaryColor, accentColor },
  };
}

export const BLEND_REFERENCE_FURNISHINGS: BlendReferenceFurnishingDefinition[] = [
  definition("modern-sofa", "现代双座软包沙发", "家具/现代沙发/现代多人沙发06", 3.146, 0.727, 1.384, 2, FABRIC, [0.88, 0.84, 0.76]),
  definition("armchair", "薄壳旋转单椅", "家具/单人沙发/单人沙发_08", 0.839, 0.971, 0.964, 1, [0.54, 0.43, 0.34], FABRIC),
  definition("ottoman", "圆形软包沙发凳", "家具/沙发凳/沙发凳-12", 0.992, 0.461, 0.994, 1, [0.82, 0.82, 0.8], DARK),
  definition("dining-table", "双板脚餐桌", "家具/桌椅/桌子.003", 2.579, 0.764, 1.209, 2, WHITE, [0.56, 0.6, 0.6]),
  definition("dining-chair", "圆座金属餐椅", "家具/桌椅/椅子", 0.531, 0.798, 0.497, 4, WHITE, [0.72, 0.75, 0.75]),
  definition("coffee-table", "三联圆形茶几", "家具/茶几边几/茶几1", 1.694, 0.567, 1.627, 3, WHITE, [0.72, 0.75, 0.76]),
  definition("cabinet", "门板开放格鞋柜", "家具/柜子/鞋柜10", 2.1, 2.5, 0.35, 4, [0.72, 0.8, 0.82], WHITE),
  definition("refrigerator", "双门冰箱", "电器/电器/双门冰箱", 0.924, 1.798, 0.586, 2, WHITE, DARK),
  definition("washing-machine", "滚筒洗衣机", "电器/电器/洗衣机", 0.611, 0.88, 0.598, 1, WHITE, DARK),
  definition("desktop-monitor", "超薄桌面显示器", "电器/电器/显示器", 0.645, 0.529, 0.175, 1, DARK, METAL),
  definition("wall-air-conditioner", "壁挂式空调", "电器/电器/挂式空调", 0.8, 0.15, 0.25, 1, WHITE, DARK),
  definition("keyboard", "全尺寸有线键盘", "电器/电器/键盘", 0.494, 0.022, 0.209, 15, DARK, METAL),
  definition("pendant-lamp", "环形吊灯", "灯饰/灯饰/吊灯.011", 0.8, 0.735, 0.8, 8, WHITE, [0.75, 0.78, 0.78]),
  definition("wine-bottle", "细颈酒瓶", "摆设/酒瓶/酒瓶04", 0.09, 0.317, 0.088, 1, WHITE, [0.72, 0.57, 0.33]),
  definition("chinese-ornament", "中式器物组合", "摆设/中式摆件/中式饰品组合", 1.578, 0.407, 0.252, 5, WHITE, [0.72, 0.75, 0.75]),
  definition("indoor-plant", "分枝阔叶盆栽", "摆设/植物/植物.044", 1.078, 1.77, 1.088, 18, GREEN, WHITE),
];

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function tubeBetween(start: Vec3, end: Vec3, radius: number): Mesh {
  return sweep(polyline([start, end]), { radius, sides: 10, caps: true });
}

function soft(width: number, height: number, depth: number, radius: number): Mesh {
  return upholsteredPanel(width, height, depth, radius);
}

function loosePillow(width: number, height: number, depth: number, radius: number): Mesh {
  return looseUpholsteredCushion(width, height, depth, radius);
}

function semanticSurfaceType(name: string, surfaceType: string): string {
  if (surfaceType === "stone") return "marble";
  if (surfaceType === "metal") {
    return /^(refrigerator_shell|refrigerator_doors|washer_shell)$/.test(name)
      ? "glossPaint"
      : "brushedMetal";
  }
  if (surfaceType === "wood" && /(cabinet|table|shelf|door)/.test(name)) return "lacqueredWood";
  return surfaceType;
}

function semanticSurfaceParams(name: string, surfaceType: string, color: RGB): Record<string, unknown> {
  const seed = [...name].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381) % 1000;
  const darker = color.map((channel) => Math.max(0, channel * 0.58)) as RGB;
  const subtle = color.map((channel) => Math.max(0, channel * 0.84)) as RGB;
  if (surfaceType === "wovenTextile") {
    return { color, secondaryColor: darker, pattern: "herringbone", scale: 52, fiberStrength: 0.58, wear: 0.1, seed };
  }
  if (surfaceType === "marble") return { color, veinColor: subtle, seed };
  if (surfaceType === "lacqueredWood") return { tone: color, ringScale: 16, seed };
  if (surfaceType === "glass") return { tint: color, roughness: 0.04, thickness: 0.035, seed };
  if (surfaceType === "brushedMetal") return { color, rotation: (seed % 4) * Math.PI * 0.25, seed };
  if (surfaceType === "glossPaint") return { color, seed };
  if (surfaceType === "fur") return { tint: color, seed };
  return { color, roughness: surfaceType === "metal" ? 0.3 : 0.72, seed };
}

function part(name: string, label: string, meshes: Mesh | Mesh[], color: RGB, surfaceType: string): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  const matchedSurfaceType = semanticSurfaceType(name, surfaceType);
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: matchedSurfaceType, params: semanticSurfaceParams(name, matchedSurfaceType, color) },
    metadata: { sourceMeshUsed: false, reconstruction: "procedural-blend-reference" },
  };
}

function sofa(p: BlendReferenceFurnishingParams): NamedPart[] {
  const count = Math.max(2, Math.min(7, Math.round(p.modules)));
  const armW = p.width * 0.09;
  const innerW = p.width - armW * 2;
  const unit = innerW / count;
  const deck = moved(soft(innerW, p.height * 0.24, p.depth * 0.83, p.height * 0.08), 0, p.height * 0.25, p.depth * 0.01);
  const seats = moved(continuousTuftedPad({
    width: innerW,
    height: p.height * 0.22,
    depth: p.depth * 0.62,
    columns: count,
    seamDepth: p.height * 0.026,
    wrinkleStrength: p.height * 0.004,
  }), 0, p.height * 0.39, p.depth * 0.1);
  const backs = Array.from({ length: count }, (_, index) => moved(
    loosePillow(unit * 0.98, p.height * 0.48, p.depth * 0.23, p.height * 0.07),
    -innerW * 0.5 + unit * (index + 0.5), p.height * 0.65, -p.depth * 0.31, -0.12,
  ));
  const arms = [-1, 1].map((side) => moved(
    soft(armW * 1.2, p.height * 0.48, p.depth * 0.85, p.height * 0.09),
    side * (p.width * 0.5 - armW * 0.55), p.height * 0.35, 0,
  ));
  const sidePillows = [-1, 1].map((side) => moved(
    loosePillow(p.width * 0.17, p.height * 0.44, p.depth * 0.28, p.height * 0.065),
    side * p.width * 0.415, p.height * 0.6, p.depth * 0.02, -0.12, 0, side * 0.13,
  ));
  const throwPillows = [
    moved(loosePillow(p.width * 0.18, p.height * 0.34, p.depth * 0.17, 0.055), p.width * 0.21, p.height * 0.55, p.depth * 0.08, -0.08, 0, 0.16),
    moved(loosePillow(p.width * 0.16, p.height * 0.29, p.depth * 0.15, 0.05), p.width * 0.3, p.height * 0.48, p.depth * 0.15, -0.06, 0, -0.18),
  ];
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(
    box(p.width * 0.025, p.height * 0.12, p.depth * 0.045),
    sx * p.width * 0.43, p.height * 0.06, sz * p.depth * 0.33,
  )));
  return [
    part("continuous_upholstered_deck", "连续软包承托底胚", deck, p.primaryColor, "fabric"),
    part("seat_cushions", "连续压缝模块座垫", seats, p.primaryColor, "fabric"),
    part("back_cushions", "靠背软包", backs, p.accentColor, "fabric"),
    part("wrap_armrests", "环抱扶手", arms, p.primaryColor, "fabric"),
    part("side_pillows", "扶手侧枕", sidePillows, p.accentColor, "fabric"),
    part("throw_pillows", "叠放抱枕", throwPillows, p.accentColor, "fabric"),
    part("recessed_legs", "内缩支脚", legs, DARK, "metal"),
  ];
}

function armchair(p: BlendReferenceFurnishingParams): NamedPart[] {
  const seatW = p.width * 0.62;
  const hub = vec3(0, p.height * 0.08, 0);
  const star = [0.16, Math.PI * 0.5, Math.PI - 0.16, Math.PI * 1.5].map((angle) => tubeBetween(
    hub,
    vec3(Math.cos(angle) * p.width * 0.48, p.height * 0.035, Math.sin(angle) * p.depth * 0.34),
    p.width * 0.022,
  ));
  return [
    part("sealed_chair_base", "连续椅座底胚", moved(soft(seatW * 1.12, p.height * 0.11, p.depth * 0.58, 0.075), 0, p.height * 0.34, p.depth * 0.02, -0.1), p.primaryColor, "fabric"),
    part("chair_seat", "前倾座垫", moved(loosePillow(seatW * 1.2, p.height * 0.16, p.depth * 0.6, 0.085), 0, p.height * 0.43, p.depth * 0.1, -0.12), p.accentColor, "fabric"),
    part("chair_back", "薄壳弧形靠背", moved(soft(p.width * 0.92, p.height * 0.52, p.depth * 0.1, p.depth * 0.045), 0, p.height * 0.7, -p.depth * 0.25, -0.5), p.primaryColor, "fabric"),
    part("lumbar_pad", "腰靠软包", moved(loosePillow(p.width * 0.74, p.height * 0.14, p.depth * 0.09, 0.055), 0, p.height * 0.57, -p.depth * 0.1, -0.35), p.accentColor, "fabric"),
    part("chair_arms", "连续上扬侧翼", [-1, 1].map((side) => moved(soft(p.width * 0.12, p.height * 0.22, p.depth * 0.58, p.width * 0.055), side * p.width * 0.42, p.height * 0.49, -p.depth * 0.03, -0.18, 0, -side * 0.04)), p.primaryColor, "fabric"),
    part("swivel_base", "四星旋转底座", [...star, moved(cylinder(p.width * 0.045, p.height * 0.25, 20, true), 0, p.height * 0.17, 0)], DARK, "metal"),
  ];
}

function ottoman(p: BlendReferenceFurnishingParams): NamedPart[] {
  const body = moved(transform(sphere(1, 48, 24), {
    scale: vec3(p.width * 0.5, p.height * 0.5, p.depth * 0.5),
  }), 0, p.height * 0.5, 0);
  const crown = moved(transform(sphere(1, 40, 14), {
    scale: vec3(p.width * 0.42, p.height * 0.025, p.depth * 0.42),
  }), 0, p.height * 0.94, 0);
  return [
    part("sealed_ottoman_body", "连续圆形凳体", body, p.primaryColor, "fabric"),
    part("crowned_top", "微鼓凳面", crown, p.primaryColor, "fabric"),
  ];
}

function diningTable(p: BlendReferenceFurnishingParams): NamedPart[] {
  const top = moved(soft(p.width, p.height * 0.1, p.depth, 0.035), 0, p.height * 0.94, 0);
  const legs = [-1, 1].map((side) => moved(
    soft(p.width * 0.08, p.height * 0.84, p.depth * 0.5, 0.035),
    side * p.width * 0.31, p.height * 0.43, 0,
  ));
  return [part("table_top", "薄板桌面", top, p.primaryColor, "stone"), part("table_legs", "双板桌脚", legs, p.accentColor, "stone")];
}

function diningChair(p: BlendReferenceFurnishingParams): NamedPart[] {
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => tubeBetween(
    vec3(sx * p.width * 0.32, 0, sz * p.depth * 0.28),
    vec3(sx * p.width * 0.25, p.height * 0.49, sz * p.depth * 0.22),
    p.width * 0.022,
  )));
  return [
    part("chair_frame", "外撇金属椅腿", legs, p.accentColor, "metal"),
    part("chair_seat_pad", "圆形软包座面", moved(cylinder(p.width * 0.47, p.height * 0.085, 40, true), 0, p.height * 0.52, 0), p.primaryColor, "fabric"),
    part("chair_back_pad", "椭圆靠背软包", moved(soft(p.width * 0.76, p.height * 0.25, p.depth * 0.09, p.height * 0.1), 0, p.height * 0.82, -p.depth * 0.32, -0.06), p.primaryColor, "fabric"),
    part("chair_back_supports", "靠背支杆", [-1, 1].map((side) => tubeBetween(
      vec3(side * p.width * 0.28, p.height * 0.43, -p.depth * 0.24),
      vec3(side * p.width * 0.27, p.height * 0.78, -p.depth * 0.3),
      p.width * 0.018,
    )), p.accentColor, "metal"),
  ];
}

function coffeeTable(p: BlendReferenceFurnishingParams): NamedPart[] {
  const tables = [
    { x: -p.width * 0.22, z: 0, radius: p.width * 0.27, height: p.height * 0.92 },
    { x: p.width * 0.17, z: -p.depth * 0.2, radius: p.width * 0.22, height: p.height * 0.76 },
    { x: p.width * 0.27, z: p.depth * 0.22, radius: p.width * 0.17, height: p.height * 0.62 },
  ];
  const tops = tables.map((table) => moved(cylinder(table.radius, p.height * 0.055, 48, true), table.x, table.height, table.z));
  const frames = tables.flatMap((table) => {
    const corners = Array.from({ length: 4 }, (_, index) => {
      const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
      return vec3(table.x + Math.cos(angle) * table.radius * 0.72, 0.03, table.z + Math.sin(angle) * table.radius * 0.72);
    });
    const upper = corners.map((point) => vec3(
      table.x + (point.x - table.x) * 0.82,
      table.height - p.height * 0.055,
      table.z + (point.z - table.z) * 0.82,
    ));
    return corners.flatMap((point, index) => [
      tubeBetween(point, upper[(index + 1) % 4]!, p.width * 0.009),
      tubeBetween(point, upper[index]!, p.width * 0.009),
    ]);
  });
  return [
    part("coffee_tops", "三联圆形台面", tops, p.primaryColor, "stone"),
    part("wire_frames", "交叉金属桌架", frames, p.accentColor, "metal"),
  ];
}

function cabinet(p: BlendReferenceFurnishingParams): NamedPart[] {
  const leftWidth = p.width * 0.76;
  const rightWidth = p.width - leftWidth;
  const doorWidth = leftWidth / 3;
  const doors = Array.from({ length: 3 }, (_, index) => moved(
    soft(doorWidth * 0.95, p.height * 0.78, p.depth * 0.045, 0.012),
    -p.width * 0.5 + doorWidth * (index + 0.5), p.height * 0.57, p.depth * 0.515,
  ));
  const bottomDoors = Array.from({ length: 2 }, (_, index) => moved(
    soft(leftWidth * 0.47, p.height * 0.18, p.depth * 0.045, 0.012),
    -p.width * 0.5 + leftWidth * (index * 0.5 + 0.25), p.height * 0.11, p.depth * 0.515,
  ));
  const shelfX = p.width * 0.5 - rightWidth * 0.5;
  const shelves = [0.22, 0.46, 0.7].map((ratio) => moved(
    box(rightWidth * 0.9, p.height * 0.018, p.depth * 0.88), shelfX, p.height * ratio, 0.02,
  ));
  const carcass = [
    moved(box(p.width, p.height, p.depth * 0.12), 0, p.height * 0.5, -p.depth * 0.44),
    moved(box(p.width, p.height * 0.025, p.depth), 0, p.height * 0.9875, 0),
    moved(box(p.width, p.height * 0.025, p.depth), 0, p.height * 0.0125, 0),
    moved(box(p.width * 0.025, p.height, p.depth), -p.width * 0.4875, p.height * 0.5, 0),
    moved(box(p.width * 0.025, p.height, p.depth), p.width * 0.4875, p.height * 0.5, 0),
    moved(box(p.width * 0.025, p.height, p.depth), p.width * 0.5 - rightWidth, p.height * 0.5, 0),
  ];
  return [
    part("cabinet_carcass", "柜体", carcass, p.primaryColor, "wood"),
    part("cabinet_doors", "左侧门板", [...doors, ...bottomDoors], p.primaryColor, "wood"),
    part("open_shelves", "右侧开放格", shelves, p.accentColor, "wood"),
    part("cabinet_handles", "暗藏拉手", doors.map((_, index) => moved(box(doorWidth * 0.46, p.height * 0.012, 0.018), -p.width * 0.5 + doorWidth * (index + 0.5), p.height * 0.18, p.depth * 0.55)), DARK, "metal"),
  ];
}

function refrigerator(p: BlendReferenceFurnishingParams): NamedPart[] {
  return [
    part("refrigerator_shell", "冰箱机身", moved(soft(p.width, p.height, p.depth, 0.04), 0, p.height * 0.5, 0), p.primaryColor, "metal"),
    part("refrigerator_doors", "双开门板", [-1, 1].map((side) => moved(soft(p.width * 0.47, p.height * 0.9, p.depth * 0.035, 0.025), side * p.width * 0.245, p.height * 0.53, p.depth * 0.52)), p.primaryColor, "metal"),
    part("refrigerator_handles", "竖向把手", [-1, 1].map((side) => moved(cylinder(0.014, p.height * 0.38, 10, true), side * p.width * 0.08, p.height * 0.58, p.depth * 0.56)), p.accentColor, "metal"),
  ];
}

function washingMachine(p: BlendReferenceFurnishingParams): NamedPart[] {
  const frontZ = p.depth * 0.51;
  return [
    part("washer_shell", "洗衣机机身", moved(soft(p.width, p.height, p.depth, 0.035), 0, p.height * 0.5, 0), p.primaryColor, "metal"),
    part("washer_door", "滚筒舱门", moved(torus(p.width * 0.25, p.width * 0.045, 36, 10), 0, p.height * 0.47, frontZ, Math.PI / 2), p.accentColor, "metal"),
    part("washer_glass", "舱门玻璃", moved(cylinder(p.width * 0.2, 0.025, 36, true), 0, p.height * 0.47, frontZ + 0.012, Math.PI / 2), [0.12, 0.2, 0.24], "glass"),
    part("washer_controls", "控制面板", [moved(box(p.width * 0.55, p.height * 0.11, 0.025), -p.width * 0.12, p.height * 0.86, frontZ), moved(cylinder(p.width * 0.06, 0.025, 24, true), p.width * 0.31, p.height * 0.86, frontZ, Math.PI / 2)], p.accentColor, "plastic"),
  ];
}

function desktopMonitor(p: BlendReferenceFurnishingParams): NamedPart[] {
  const panelHeight = p.height * 0.715;
  const panelY = p.height * 0.6375;
  return [
    part("monitor_panel", "超薄显示面板", moved(roundedBox({
      width: p.width,
      height: panelHeight,
      depth: p.depth * 0.19,
      radius: p.width * 0.012,
      steps: 3,
    }), 0, panelY, p.depth * 0.17), p.primaryColor, "plastic"),
    part("monitor_rear_housing", "背部主机凸台", moved(roundedBox({
      width: p.width * 0.18,
      height: panelHeight * 0.12,
      depth: p.depth * 0.28,
      radius: p.width * 0.018,
      steps: 3,
    }), 0, panelY + panelHeight * 0.05, -p.depth * 0.03), p.primaryColor, "plastic"),
    part("monitor_cables", "背部连接线", [0, p.width * 0.025].map((offset) => sweep(smoothCurve(polyline([
      vec3(offset, panelY + panelHeight * 0.25, p.depth * 0.08),
      vec3(offset, panelY + panelHeight * 0.16, -p.depth * 0.12),
      vec3(offset, panelY + panelHeight * 0.04, -p.depth * 0.08),
      vec3(offset, panelY - panelHeight * 0.02, -p.depth * 0.02),
    ]), 4), { radius: p.width * 0.004, sides: 6, caps: true })), p.primaryColor, "rubber"),
    part("monitor_stand", "中央立柱", moved(roundedBox({
      width: p.width * 0.07,
      height: p.height * 0.62,
      depth: p.depth * 0.26,
      radius: p.width * 0.009,
      steps: 2,
    }), 0, p.height * 0.32, -p.depth * 0.125), p.accentColor, "metal"),
    part("monitor_base", "宽型桌面底座", moved(roundedBox({
      width: p.width * 0.49,
      height: p.height * 0.025,
      depth: p.depth,
      radius: p.height * 0.012,
      steps: 2,
    }), 0, p.height * 0.013, p.depth * 0.02), p.accentColor, "metal"),
  ];
}

function wallAirConditioner(p: BlendReferenceFurnishingParams): NamedPart[] {
  const body = moved(roundedBox({
    width: p.width,
    height: p.height * 0.94,
    depth: p.depth,
    radius: p.height * 0.18,
    steps: 4,
  }), 0, p.height * 0.53, 0);
  return [
    part("air_conditioner_shell", "弧面空调外壳", body, p.primaryColor, "plastic"),
    part("air_conditioner_front_lip", "前盖收边", moved(roundedBox({
      width: p.width * 0.985,
      height: p.height * 0.72,
      depth: p.depth * 0.08,
      radius: p.height * 0.12,
      steps: 3,
    }), 0, p.height * 0.55, p.depth * 0.49), p.primaryColor, "plastic"),
    part("air_conditioner_vent", "底部送风口", moved(box(p.width * 0.9, p.height * 0.08, p.depth * 0.42), 0, p.height * 0.08, p.depth * 0.2, -0.08), p.accentColor, "plastic"),
  ];
}

function keyboard(p: BlendReferenceFurnishingParams): NamedPart[] {
  const rows = 5;
  const columns = Math.max(12, Math.min(18, Math.round(p.modules)));
  const gap = p.width * 0.006;
  const keyWidth = (p.width * 0.91 - gap * (columns - 1)) / columns;
  const keyDepth = p.depth * 0.125;
  const keys: Mesh[] = [];
  for (let row = 0; row < rows; row++) {
    const count = row === rows - 1 ? columns - 2 : columns;
    const rowWidth = count * keyWidth + (count - 1) * gap;
    for (let column = 0; column < count; column++) {
      const isSpace = row === rows - 1 && column === Math.floor(count / 2);
      const width = isSpace ? keyWidth * 3.2 : keyWidth;
      const x = -rowWidth * 0.5 + keyWidth * 0.5 + column * (keyWidth + gap);
      keys.push(moved(roundedBox({
        width,
        height: p.height * 0.38,
        depth: keyDepth,
        radius: p.height * 0.08,
        steps: 1,
      }), x, p.height * (0.7 + row * 0.025), -p.depth * 0.31 + row * keyDepth * 1.12, -0.035));
    }
  }
  const cableCurve = smoothCurve(polyline([
    vec3(0.06, p.height * 0.62, -p.depth * 0.31),
    vec3(0.2, p.height * 0.72, -p.depth * 0.43),
    vec3(0.23, p.height * 0.82, -p.depth * 0.62),
    vec3(0.1, p.height * 0.82, -p.depth * 0.8),
    vec3(-0.08, p.height * 0.82, -p.depth * 0.72),
    vec3(-0.23, p.height * 0.76, -p.depth * 0.58),
    vec3(-0.16, p.height * 0.72, -p.depth * 0.41),
    vec3(0.02, p.height * 0.68, -p.depth * 0.33),
  ]), 5);
  return [
    part("keyboard_chassis", "低倾角键盘底壳", moved(roundedBox({
      width: p.width,
      height: p.height * 0.58,
      depth: p.depth * 0.74,
      radius: p.height * 0.16,
      steps: 2,
    }), 0, p.height * 0.3, p.depth * 0.04, -0.025), p.primaryColor, "plastic"),
    part("keyboard_keys", "分区键帽阵列", keys, p.accentColor, "plastic"),
    part("keyboard_cable", "背部弯曲连接线", sweep(cableCurve, { radius: p.height * 0.08, sides: 7, caps: true }), p.primaryColor, "rubber"),
  ];
}

function pendantLamp(p: BlendReferenceFurnishingParams): NamedPart[] {
  const ringY = p.height * 0.23;
  const ringRadius = p.width * 0.39;
  const cableTop = vec3(0, p.height * 0.92, 0);
  const cableAnchors = Array.from({ length: 4 }, (_, index) => {
    const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
    return vec3(Math.cos(angle) * ringRadius, ringY, Math.sin(angle) * ringRadius);
  });
  const shades = Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI * 0.25;
    return moved(
      soft(p.width * 0.22, p.height * 0.15, p.depth * 0.075, p.height * 0.045),
      Math.cos(angle) * ringRadius,
      ringY,
      Math.sin(angle) * ringRadius,
      0,
      -angle,
      0,
    );
  });
  return [
    part("ceiling_cap", "吸顶盘", moved(cylinder(p.width * 0.13, p.height * 0.055, 32, true), 0, p.height * 0.965, 0), p.primaryColor, "metal"),
    part("lamp_cables", "四点吊线", cableAnchors.map((anchor) => tubeBetween(cableTop, anchor, p.width * 0.006)), p.accentColor, "metal"),
    part("lamp_ring", "环形灯架", moved(torus(ringRadius, p.width * 0.018, 64, 10), 0, ringY, 0), p.accentColor, "metal"),
    part("ring_shades", "环形漫射罩", shades, p.primaryColor, "plastic"),
  ];
}

function wineBottle(p: BlendReferenceFurnishingParams): NamedPart[] {
  const r = p.width * 0.5;
  const profile = [vec2(0, 0), vec2(r * 0.86, 0), vec2(r, p.height * 0.08), vec2(r, p.height * 0.62), vec2(r * 0.7, p.height * 0.72), vec2(r * 0.32, p.height * 0.78), vec2(r * 0.3, p.height * 0.94), vec2(r * 0.38, p.height * 0.96), vec2(r * 0.38, p.height), vec2(0, p.height)];
  return [
    part("bottle_body", "旋转瓶身", computeNormals(lathe(profile, { segments: 48 }), 40), p.primaryColor, "glass"),
    part("bottle_label", "瓶身标签", moved(cylinder(r * 1.01, p.height * 0.2, 48, true), 0, p.height * 0.47, 0), p.accentColor, "paper"),
    part("bottle_stop", "瓶塞", moved(cylinder(r * 0.27, p.height * 0.06, 24, true), 0, p.height * 1.01, 0), [0.45, 0.24, 0.1], "wood"),
  ];
}

function chineseOrnament(p: BlendReferenceFurnishingParams): NamedPart[] {
  const jar = (radius: number, height: number) => {
    const profile = [
      vec2(0, 0), vec2(radius * 0.84, 0), vec2(radius, height * 0.08),
      vec2(radius, height * 0.76), vec2(radius * 0.8, height * 0.9), vec2(0, height * 0.9),
    ];
    return computeNormals(lathe(profile, { segments: 40 }), 40);
  };
  const leftJarX = -p.width * 0.4;
  const smallJarX = -p.width * 0.2;
  const plateX = p.width * 0.03;
  const bookX = p.width * 0.32;
  const plateRadius = p.height * 0.32;
  return [
    part("ornament_jars", "双罐器物", [
      moved(jar(p.width * 0.085, p.height * 0.78), leftJarX, 0, 0),
      moved(jar(p.width * 0.075, p.height * 0.65), smallJarX, 0, 0),
    ], p.primaryColor, "ceramic"),
    part("jar_lids", "双罐盖", [
      moved(cylinder(p.width * 0.075, p.height * 0.06, 32, true), leftJarX, p.height * 0.78, 0),
      moved(cylinder(p.width * 0.066, p.height * 0.055, 32, true), smallJarX, p.height * 0.65, 0),
    ], p.primaryColor, "ceramic"),
    part("display_plate", "立式圆盘", moved(cylinder(plateRadius, p.depth * 0.12, 48, true), plateX, p.height * 0.38, 0, Math.PI / 2), p.primaryColor, "ceramic"),
    part("plate_stand", "圆盘支架", [
      tubeBetween(vec3(plateX - plateRadius * 0.55, 0, 0), vec3(plateX, p.height * 0.3, 0), p.width * 0.008),
      tubeBetween(vec3(plateX + plateRadius * 0.55, 0, 0), vec3(plateX, p.height * 0.3, 0), p.width * 0.008),
    ], p.accentColor, "metal"),
    part("ornament_books", "立式书盒", [
      moved(soft(p.width * 0.16, p.height * 0.54, p.depth * 0.72, 0.012), bookX, p.height * 0.27, 0),
      moved(soft(p.width * 0.12, p.height * 0.5, p.depth * 0.76, 0.012), bookX + p.width * 0.16, p.height * 0.25, 0),
    ], p.primaryColor, "paper"),
    part("book_relief", "书盒圆形浮雕", moved(cylinder(p.height * 0.15, p.depth * 0.05, 40, true), bookX + p.width * 0.16, p.height * 0.25, p.depth * 0.4, Math.PI / 2), p.accentColor, "ceramic"),
  ];
}

function indoorPlant(p: BlendReferenceFurnishingParams): NamedPart[] {
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const count = Math.max(5, Math.min(24, Math.round(p.modules * Math.max(0.5, p.detail))));
  const potH = p.height * 0.27;
  const potR = p.width * 0.25;
  const potProfile = [vec2(0, 0), vec2(potR * 0.92, 0), vec2(potR, potH * 0.05), vec2(potR, potH * 0.94), vec2(potR * 1.03, potH), vec2(potR * 0.82, potH), vec2(0, potH * 0.9)];
  const stems: Mesh[] = [];
  const leaves: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const lean = rng.range(0.14, 0.45);
    const stemH = rng.range(p.height * 0.42, p.height * 0.68);
    const radius = rng.range(p.width * 0.08, p.width * 0.34);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    stems.push(moved(cylinder(p.width * 0.012, stemH, 8, true), x * 0.45, potH + stemH * 0.48, z * 0.45, Math.sin(angle) * lean, 0, -Math.cos(angle) * lean));
    leaves.push(moved(transform(sphere(1, 14, 8), { scale: vec3(p.width * 0.16, p.height * 0.045, p.width * 0.08) }), x, potH + stemH * 0.88, z, rng.range(-0.4, 0.4), -angle, rng.range(-0.35, 0.35)));
    if (p.detail > 0.75) leaves.push(moved(transform(sphere(1, 12, 7), { scale: vec3(p.width * 0.12, p.height * 0.038, p.width * 0.065) }), x * 0.7, potH + stemH * 0.67, z * 0.7, rng.range(-0.35, 0.35), -angle, rng.range(-0.3, 0.3)));
  }
  return [
    part("plant_pot", "旋转体花盆", computeNormals(lathe(potProfile, { segments: 40 }), 40), p.accentColor, "ceramic"),
    part("plant_stems", "分枝茎干", stems, [0.2, 0.29, 0.12], "wood"),
    part("plant_leaves", "散布叶片", leaves, p.primaryColor, "foliage"),
  ];
}

const BUILDERS: Record<BlendReferenceFurnishingKind, (params: BlendReferenceFurnishingParams) => NamedPart[]> = {
  "modern-sofa": sofa,
  armchair,
  ottoman,
  "dining-table": diningTable,
  "dining-chair": diningChair,
  "coffee-table": coffeeTable,
  cabinet,
  refrigerator,
  "washing-machine": washingMachine,
  "desktop-monitor": desktopMonitor,
  "wall-air-conditioner": wallAirConditioner,
  keyboard,
  "pendant-lamp": pendantLamp,
  "wine-bottle": wineBottle,
  "chinese-ornament": chineseOrnament,
  "indoor-plant": indoorPlant,
};

export function buildBlendReferenceFurnishingParts(
  input: Partial<BlendReferenceFurnishingParams> & Pick<BlendReferenceFurnishingParams, "kind">,
): NamedPart[] {
  const definition = BLEND_REFERENCE_FURNISHINGS.find((entry) => entry.defaults.kind === input.kind);
  if (!definition) throw new Error(`Unknown Blender reference furnishing: ${input.kind}`);
  const params = { ...definition.defaults, ...input, kind: input.kind };
  return BUILDERS[input.kind](params);
}
