/** Parametric interior archetypes reconstructed from the local Blender library. */
import {
  box,
  cylinder,
  lathe,
  makeMesh,
  merge,
  polyline,
  recomputeNormals,
  roundedBox,
  solidify,
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

type RGB = [number, number, number];

export type BlendReferenceInteriorKind =
  | "curtain"
  | "venetian-blind"
  | "european-door"
  | "table-lamp"
  | "floor-lamp"
  | "sculptural-chandelier"
  | "copier"
  | "service-kiosk"
  | "massage-chair"
  | "wine-cabinet"
  | "side-table"
  | "book-row"
  | "bar-accessories"
  | "tv-wall";

export interface BlendReferenceInteriorParams {
  kind: BlendReferenceInteriorKind;
  width: number;
  height: number;
  depth: number;
  modules: number;
  detail: number;
  seed: number;
  primaryColor: RGB;
  accentColor: RGB;
}

export interface BlendReferenceInteriorDefinition {
  id: string;
  name: string;
  sourceCategory: string;
  defaults: BlendReferenceInteriorParams;
}

const WHITE: RGB = [0.82, 0.84, 0.84];
const WARM_WHITE: RGB = [0.82, 0.78, 0.7];
const DARK: RGB = [0.075, 0.085, 0.095];
const METAL: RGB = [0.34, 0.37, 0.39];
const WOOD: RGB = [0.38, 0.24, 0.14];
const GLASS: RGB = [0.35, 0.55, 0.62];

function definition(
  kind: BlendReferenceInteriorKind,
  name: string,
  sourceCategory: string,
  width: number,
  height: number,
  depth: number,
  modules: number,
  primaryColor: RGB,
  accentColor: RGB,
): BlendReferenceInteriorDefinition {
  return {
    id: `blend-ref-${kind}`,
    name,
    sourceCategory,
    defaults: { kind, width, height, depth, modules, detail: 1, seed: 47, primaryColor, accentColor },
  };
}

export const BLEND_REFERENCE_INTERIORS: BlendReferenceInteriorDefinition[] = [
  definition("curtain", "落地密褶窗帘", "主体/主体/窗帘", 0.9, 2.8, 0.16, 24, WARM_WHITE, WHITE),
  definition("venetian-blind", "横向百叶窗", "主体/主体/百页窗", 1.377375, 2.325259, 0.0871, 42, WHITE, METAL),
  definition("european-door", "双芯板欧式房门", "主体/主体/欧式房门", 1.031134, 2.230841, 0.125142, 2, WHITE, METAL),
  definition("table-lamp", "环形阅读台灯", "灯饰/灯饰/台灯.002", 0.361784, 0.448077, 0.3, 1, WHITE, WARM_WHITE),
  definition("floor-lamp", "双索悬吊落地灯", "灯饰/灯饰/落地灯.002", 0.67895, 1.649587, 0.315625, 2, WHITE, METAL),
  definition("sculptural-chandelier", "三环雕塑吊灯", "灯饰/灯饰/吊灯.004", 1.348159, 1.108245, 1.34307, 3, WARM_WHITE, METAL),
  definition("copier", "落地多功能复印机", "电器/电器/复印机", 0.649956, 1.338782, 0.829824, 4, WHITE, DARK),
  definition("service-kiosk", "立式自助服务机", "电器/电器/自助服务机1", 0.499999, 1.888124, 0.876423, 1, WHITE, DARK),
  definition("massage-chair", "躺式按摩椅", "家具/桌椅/按摩椅", 0.779935, 0.93778, 1.267686, 4, [0.68, 0.65, 0.6], WHITE),
  definition("wine-cabinet", "整墙开放格酒柜", "家具/柜子/酒柜4", 5.2, 2.5, 0.350004, 6, [0.26, 0.28, 0.29], WOOD),
  definition("side-table", "三脚圆形边几", "家具/茶几边几/茶几边几_01-1", 0.799967, 0.525731, 0.799967, 3, WHITE, METAL),
  definition("book-row", "中式精装书列", "摆设/书籍/中式书籍02", 0.499596, 0.3, 0.2, 10, [0.42, 0.2, 0.14], WARM_WHITE),
  definition("bar-accessories", "酒瓶杯具陈列组合", "摆设/酒柜配饰/酒柜配饰.010", 0.48, 0.34, 0.28, 5, [0.2, 0.34, 0.24], [0.7, 0.55, 0.26]),
  definition("tv-wall", "嵌入式电视背景墙", "主体/背景墙/电视墙.001", 3.200002, 2.200001, 0.308211, 3, [0.66, 0.67, 0.65], DARK),
];

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function scaled(mesh: Mesh, x: number, y: number, z: number): Mesh {
  return transform(mesh, { scale: vec3(x, y, z) });
}

function tubeBetween(start: Vec3, end: Vec3, radius: number, sides = 10): Mesh {
  return sweep(polyline([start, end]), { radius, sides, caps: true });
}

function semanticSurfaceType(name: string, surfaceType: string): string {
  if (surfaceType === "fabric") {
    if (name.startsWith("massage_chair_")) return "leather";
    return name === "pleated_fabric" || name === "curtain_header" ? "decorativeTextile" : "wovenTextile";
  }
  if (surfaceType === "textile") return "wovenTextile";
  if (surfaceType === "stone") return "marble";
  if (surfaceType === "metal") return "brushedMetal";
  if (surfaceType === "wood" && /(cabinet|table|shelf|door|console)/.test(name)) return "lacqueredWood";
  return surfaceType;
}

function semanticSurfaceParams(name: string, surfaceType: string, color: RGB): Record<string, unknown> {
  const seed = [...name].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381) % 1000;
  const darker = color.map((channel) => Math.max(0, channel * 0.58)) as RGB;
  const subtle = color.map((channel) => Math.max(0, channel * 0.84)) as RGB;
  if (surfaceType === "wovenTextile") {
    return { color, secondaryColor: darker, pattern: "herringbone", scale: 52, fiberStrength: 0.58, wear: 0.1, seed };
  }
  if (surfaceType === "decorativeTextile") {
    return { color, secondaryColor: darker, accentColor: color, style: "jacquard", scale: 54, relief: 0.5, seed };
  }
  if (surfaceType === "leather") return { color, grainScale: 44, grainStrength: 0.85, normalStrength: 1.8, clearcoat: 0.12, seed };
  if (surfaceType === "marble") return { color, veinColor: subtle, seed };
  if (surfaceType === "lacqueredWood") return { tone: color, ringScale: 16, seed };
  if (surfaceType === "glass") return { tint: color, roughness: 0.04, thickness: 0.035, seed };
  if (surfaceType === "brushedMetal") return { color, rotation: (seed % 4) * Math.PI * 0.25, seed };
  return { color, roughness: 0.7, seed };
}

function part(name: string, label: string, meshes: Mesh | Mesh[], color: RGB, surfaceType: string, doubleSided = false): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  const matchedSurfaceType = semanticSurfaceType(name, surfaceType);
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    doubleSided,
    surface: {
      type: matchedSurfaceType,
      params: semanticSurfaceParams(name, matchedSurfaceType, color),
    },
    metadata: { sourceMeshUsed: false, reconstruction: "procedural-blend-reference" },
  };
}

function curtainSurface(width: number, height: number, depth: number, folds: number): Mesh {
  const columns = Math.max(24, folds * 4);
  const rows = 28;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const floorEase = (1 - v) ** 3;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const x = (u - 0.5) * width * (1 + floorEase * 0.045);
      const phase = u * folds * Math.PI * 2;
      const z = Math.sin(phase) * depth * (0.36 + floorEase * 0.16) + Math.sin(phase * 0.5) * depth * 0.04;
      const y = v * height + floorEase * depth * (0.06 + 0.08 * Math.cos(phase));
      positions.push(vec3(x, y, z));
      normals.push(vec3(0, 0, 1));
      uvs.push(vec2(u, v));
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function curtain(p: BlendReferenceInteriorParams): NamedPart[] {
  const folds = Math.max(8, Math.min(48, Math.round(p.modules)));
  return [
    part("pleated_fabric", "连续落地褶皱布面", curtainSurface(p.width, p.height * 0.97, p.depth, folds), p.primaryColor, "fabric", true),
    part("curtain_header", "顶部抽褶带", moved(roundedBox({ width: p.width, height: p.height * 0.025, depth: p.depth * 0.62, radius: p.depth * 0.08, steps: 2 }), 0, p.height * 0.975, 0), p.accentColor, "fabric"),
  ];
}

function venetianBlind(p: BlendReferenceInteriorParams): NamedPart[] {
  const count = Math.max(12, Math.min(72, Math.round(p.modules)));
  const topHeight = p.height * 0.045;
  const usable = p.height - topHeight * 1.65;
  const slatH = Math.min(usable / count * 0.28, p.height * 0.009);
  const slats = Array.from({ length: count }, (_, index) => moved(
    roundedBox({ width: p.width * 0.94, height: slatH, depth: p.depth * 0.82, radius: slatH * 0.45, steps: 1 }),
    0,
    topHeight * 0.72 + usable * (index + 0.5) / count,
    0,
    -0.12,
  ));
  const cords = [-0.42, 0, 0.42].map((ratio) => moved(cylinder(p.width * 0.0023, usable, 6, true), ratio * p.width, topHeight + usable * 0.5, p.depth * 0.43));
  return [
    part("blind_slats", "等距可调百叶片", slats, p.primaryColor, "plastic"),
    part("blind_headrail", "顶部百叶盒", moved(roundedBox({ width: p.width, height: topHeight, depth: p.depth, radius: topHeight * 0.14, steps: 2 }), 0, p.height - topHeight * 0.5, 0), p.accentColor, "metal"),
    part("blind_bottom_rail", "底部配重梁", moved(roundedBox({ width: p.width * 0.94, height: topHeight * 0.62, depth: p.depth * 0.88, radius: topHeight * 0.12, steps: 1 }), 0, topHeight * 0.36, 0), p.accentColor, "metal"),
    part("blind_ladder_cords", "百叶升降绳", cords, p.accentColor, "textile"),
  ];
}

function panelMoulding(width: number, height: number, depth: number, y: number, z: number): Mesh[] {
  const rail = Math.min(width, height) * 0.045;
  return [
    moved(roundedBox({ width, height: rail, depth, radius: rail * 0.2, steps: 2 }), 0, y - height * 0.5, z),
    moved(roundedBox({ width, height: rail, depth, radius: rail * 0.2, steps: 2 }), 0, y + height * 0.5, z),
    moved(roundedBox({ width: rail, height, depth, radius: rail * 0.2, steps: 2 }), -width * 0.5, y, z),
    moved(roundedBox({ width: rail, height, depth, radius: rail * 0.2, steps: 2 }), width * 0.5, y, z),
  ];
}

function europeanDoor(p: BlendReferenceInteriorParams): NamedPart[] {
  const frameW = p.width * 0.095;
  const slabW = p.width - frameW * 2.15;
  const front = p.depth * 0.34;
  const upperY = p.height * 0.65;
  const lowerY = p.height * 0.25;
  const frames = [
    moved(box(frameW, p.height, p.depth), -p.width * 0.5 + frameW * 0.5, p.height * 0.5, 0),
    moved(box(frameW, p.height, p.depth), p.width * 0.5 - frameW * 0.5, p.height * 0.5, 0),
    moved(box(p.width, frameW, p.depth), 0, p.height - frameW * 0.5, 0),
  ];
  const moulding = [
    ...panelMoulding(slabW * 0.72, p.height * 0.38, p.depth * 0.035, upperY, front),
    ...panelMoulding(slabW * 0.66, p.height * 0.23, p.depth * 0.035, lowerY, front),
  ];
  const slabHeight = p.height - frameW;
  return [
    part("door_architrave", "欧式双层门套", frames, p.primaryColor, "wood"),
    part("door_leaf", "双芯板门扇", moved(roundedBox({ width: slabW, height: slabHeight, depth: p.depth * 0.72, radius: frameW * 0.05, steps: 2 }), 0, slabHeight * 0.5, 0), p.primaryColor, "wood"),
    part("door_panel_moulding", "上下芯板装饰线", moulding, p.accentColor, "wood"),
    part("door_handle", "横向门把手", [moved(cylinder(p.height * 0.008, p.width * 0.16, 16, true), -p.width * 0.29, p.height * 0.49, front + p.depth * 0.035, 0, 0, Math.PI / 2), moved(cylinder(p.height * 0.018, p.depth * 0.04, 16, true), -p.width * 0.36, p.height * 0.49, front, Math.PI / 2)], p.accentColor, "metal"),
  ];
}

function tableLamp(p: BlendReferenceInteriorParams): NamedPart[] {
  const stemStart = vec3(-p.width * 0.2, p.height * 0.08, 0);
  const stemEnd = vec3(-p.width * 0.12, p.height * 0.72, 0);
  return [
    part("lamp_base", "扁圆稳定底座", moved(scaled(sphere(1, 32, 12), p.width * 0.31, p.height * 0.075, p.depth * 0.31), -p.width * 0.12, p.height * 0.065, 0), p.primaryColor, "plastic"),
    part("lamp_stem", "后倾细杆", tubeBetween(stemStart, stemEnd, p.width * 0.018, 12), p.primaryColor, "metal"),
    part("lamp_ring", "椭圆环形灯头", moved(transform(torus(p.width * 0.37, p.width * 0.028, 48, 10), { scale: vec3(1, 1, p.depth / p.width * 1.05) }), p.width * 0.08, p.height * 0.78, 0, 0.12, 0, -0.08), p.accentColor, "emissive"),
    part("lamp_hinge", "灯头转轴", moved(sphere(p.width * 0.045, 16, 10), -p.width * 0.12, p.height * 0.73, 0), p.primaryColor, "plastic"),
  ];
}

function floorLamp(p: BlendReferenceInteriorParams): NamedPart[] {
  const baseY = p.height * 0.07;
  const leftTop = vec3(-p.width * 0.21, p.height * 0.98, 0);
  const rightTop = vec3(p.width * 0.18, p.height * 0.96, 0);
  const baseLeft = vec3(-p.width * 0.04, baseY + p.height * 0.03, 0);
  const baseRight = vec3(p.width * 0.08, baseY + p.height * 0.03, 0);
  const shades = [
    moved(scaled(sphere(1, 28, 10), p.width * 0.21, p.height * 0.045, p.depth * 0.32), -p.width * 0.2, p.height * 0.57, 0),
    moved(lathe([vec2(0, 0), vec2(p.width * 0.04, p.height * 0.04), vec2(p.width * 0.07, p.height * 0.1), vec2(0, p.height * 0.11)], { segments: 24 }), p.width * 0.03, p.height * 0.39, 0),
  ];
  return [
    part("floor_lamp_base", "圆柱配重底座", [moved(cylinder(p.width * 0.1, p.height * 0.15, 28, true), p.width * 0.1, p.height * 0.075, 0), moved(cylinder(p.width * 0.17, p.height * 0.025, 28, true), p.width * 0.1, p.height * 0.16, 0)], p.primaryColor, "metal"),
    part("floor_lamp_masts", "双索斜拉灯架", [tubeBetween(baseLeft, leftTop, p.width * 0.009, 8), tubeBetween(baseRight, rightTop, p.width * 0.009, 8)], p.accentColor, "metal"),
    part("floor_lamp_suspension", "垂直悬灯索", [tubeBetween(leftTop, vec3(-p.width * 0.2, p.height * 0.6, 0), p.width * 0.004, 6), tubeBetween(rightTop, vec3(p.width * 0.03, p.height * 0.48, 0), p.width * 0.004, 6)], p.accentColor, "metal"),
    part("floor_lamp_shades", "双高度悬吊灯罩", shades, p.primaryColor, "emissive"),
  ];
}

function sculpturalChandelier(p: BlendReferenceInteriorParams): NamedPart[] {
  const loops = Math.max(2, Math.min(5, Math.round(p.modules)));
  const ribbons: Mesh[] = [];
  for (let loop = 0; loop < loops; loop++) {
    const points: Vec3[] = [];
    const phase = loop * Math.PI * 2 / loops;
    for (let index = 0; index < 72; index++) {
      const t = index / 72 * Math.PI * 2;
      points.push(vec3(
        Math.cos(t + phase) * p.width * (0.36 + loop * 0.018),
        p.height * (0.42 + 0.13 * Math.sin(t * 2 + phase)),
        Math.sin(t) * p.depth * (0.36 - loop * 0.016),
      ));
    }
    ribbons.push(sweep(smoothCurve(polyline(points, true), 2), { radius: p.width * 0.018, sides: 10, caps: true }));
  }
  const canopyY = p.height * 0.95;
  const cables = [0.6, 2.55, 4.45].map((angle) => tubeBetween(
    vec3(0, canopyY, 0),
    vec3(Math.cos(angle) * p.width * 0.32, p.height * 0.5, Math.sin(angle) * p.depth * 0.32),
    p.width * 0.0035,
    6,
  ));
  return [
    part("chandelier_canopy", "圆形吸顶盘", moved(cylinder(p.width * 0.075, p.height * 0.055, 28, true), 0, canopyY, 0), p.accentColor, "metal"),
    part("chandelier_cables", "三点悬挂钢索", cables, p.accentColor, "metal"),
    part("chandelier_light_loops", "交叠发光曲线环", ribbons, p.primaryColor, "emissive"),
  ];
}

function copier(p: BlendReferenceInteriorParams): NamedPart[] {
  const bodyY = p.height * 0.36;
  const front = p.depth * 0.5;
  const drawers = Array.from({ length: Math.max(3, Math.min(6, Math.round(p.modules))) }, (_, index) => moved(
    roundedBox({ width: p.width * 0.88, height: p.height * 0.105, depth: p.depth * 0.025, radius: p.width * 0.012, steps: 1 }),
    0,
    p.height * (0.09 + index * 0.105),
    front,
  ));
  const handles = drawers.map((_, index) => moved(box(p.width * 0.18, p.height * 0.025, p.depth * 0.018), 0, p.height * (0.09 + index * 0.105), front + p.depth * 0.025));
  return [
    part("copier_lower_body", "多层纸盒机身", moved(roundedBox({ width: p.width, height: p.height * 0.68, depth: p.depth * 0.9, radius: p.width * 0.025, steps: 2 }), 0, bodyY, 0), p.primaryColor, "plastic"),
    part("copier_drawers", "四层抽拉纸盒", drawers, p.primaryColor, "plastic"),
    part("copier_drawer_handles", "纸盒暗拉手", handles, p.accentColor, "plastic"),
    part("copier_output_bridge", "中部出纸桥", [moved(box(p.width, p.height * 0.14, p.depth * 0.82), 0, p.height * 0.69, 0), moved(box(p.width * 0.86, p.height * 0.075, p.depth * 0.58), 0, p.height * 0.75, p.depth * 0.08, -0.08)], p.primaryColor, "plastic"),
    part("copier_scanner", "顶部扫描组件", [moved(roundedBox({ width: p.width, height: p.height * 0.18, depth: p.depth, radius: p.width * 0.03, steps: 2 }), 0, p.height * 0.84, 0), moved(roundedBox({ width: p.width * 0.96, height: p.height * 0.08, depth: p.depth * 0.82, radius: p.width * 0.025, steps: 2 }), 0, p.height * 0.96, -p.depth * 0.04, -0.05)], p.primaryColor, "plastic"),
    part("copier_controls", "侧置触控面板", moved(roundedBox({ width: p.width * 0.31, height: p.height * 0.035, depth: p.depth * 0.24, radius: p.width * 0.015, steps: 1 }), p.width * 0.48, p.height * 0.83, p.depth * 0.12, 0, 0, -0.08), p.accentColor, "glass"),
    part("copier_casters", "底部脚轮", [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(sphere(p.width * 0.035, 12, 8), sx * p.width * 0.42, p.width * 0.025, sz * p.depth * 0.36))), p.accentColor, "rubber"),
  ];
}

function serviceKiosk(p: BlendReferenceInteriorParams): NamedPart[] {
  return [
    part("kiosk_base", "加宽落地底座", moved(roundedBox({ width: p.width * 1.35, height: p.height * 0.025, depth: p.depth * 0.62, radius: p.height * 0.008, steps: 1 }), 0, p.height * 0.013, 0), p.primaryColor, "metal"),
    part("kiosk_spine", "超薄立式背板", moved(roundedBox({ width: p.width, height: p.height * 0.91, depth: p.depth * 0.11, radius: p.width * 0.018, steps: 2 }), 0, p.height * 0.49, -p.depth * 0.2), p.primaryColor, "metal"),
    part("kiosk_screen", "上部显示屏", moved(roundedBox({ width: p.width * 0.82, height: p.height * 0.42, depth: p.depth * 0.018, radius: p.width * 0.012, steps: 1 }), 0, p.height * 0.72, -p.depth * 0.135), p.accentColor, "glass"),
    part("kiosk_console", "前伸斜面操作台", moved(roundedBox({ width: p.width * 0.98, height: p.height * 0.12, depth: p.depth * 0.55, radius: p.width * 0.025, steps: 2 }), 0, p.height * 0.46, p.depth * 0.08, -0.22), p.primaryColor, "plastic"),
    part("kiosk_terminal", "操作台触控区", moved(box(p.width * 0.7, p.height * 0.012, p.depth * 0.27), 0, p.height * 0.52, p.depth * 0.16, -0.22), p.accentColor, "glass"),
  ];
}

function massageChair(p: BlendReferenceInteriorParams): NamedPart[] {
  const shell = roundedBox({ width: p.width * 0.82, height: p.height * 0.18, depth: p.depth * 0.5, radius: p.width * 0.08, steps: 3 });
  const sideShells = [-1, 1].map((side) => moved(roundedBox({ width: p.width * 0.12, height: p.height * 0.42, depth: p.depth * 0.58, radius: p.width * 0.045, steps: 2 }), side * p.width * 0.43, p.height * 0.32, 0));
  return [
    part("massage_chair_base", "低位机械底座", [moved(box(p.width * 0.75, p.height * 0.055, p.depth * 0.75), 0, p.height * 0.028, 0), moved(cylinder(p.width * 0.08, p.depth * 0.62, 20, true), 0, p.height * 0.14, -p.depth * 0.2, Math.PI / 2)], p.accentColor, "metal"),
    part("massage_chair_shell", "包覆式侧壳", [...sideShells, moved(shell, 0, p.height * 0.28, -p.depth * 0.08, -0.08)], p.primaryColor, "plastic"),
    part("massage_chair_seat", "厚软包座垫", moved(roundedBox({ width: p.width * 0.72, height: p.height * 0.16, depth: p.depth * 0.42, radius: p.width * 0.075, steps: 3 }), 0, p.height * 0.43, p.depth * 0.02, -0.1), p.primaryColor, "fabric"),
    part("massage_chair_back", "分区高靠背", [moved(roundedBox({ width: p.width * 0.76, height: p.height * 0.72, depth: p.depth * 0.18, radius: p.width * 0.08, steps: 3 }), 0, p.height * 0.68, -p.depth * 0.34, -0.28), moved(roundedBox({ width: p.width * 0.62, height: p.height * 0.18, depth: p.depth * 0.12, radius: p.width * 0.06, steps: 2 }), 0, p.height * 0.85, -p.depth * 0.23, -0.28)], p.primaryColor, "fabric"),
    part("massage_chair_legrest", "双通道腿托", [-1, 1].map((side) => moved(roundedBox({ width: p.width * 0.34, height: p.height * 0.16, depth: p.depth * 0.47, radius: p.width * 0.065, steps: 3 }), side * p.width * 0.19, p.height * 0.29, p.depth * 0.43, 0.24)), p.primaryColor, "fabric"),
    part("massage_chair_armrests", "双侧厚扶手", [-1, 1].map((side) => moved(roundedBox({ width: p.width * 0.16, height: p.height * 0.15, depth: p.depth * 0.47, radius: p.width * 0.045, steps: 2 }), side * p.width * 0.42, p.height * 0.54, p.depth * 0.02, -0.06)), p.accentColor, "fabric"),
    part("massage_chair_controller", "侧置控制器", [tubeBetween(vec3(-p.width * 0.5, p.height * 0.48, -p.depth * 0.05), vec3(-p.width * 0.62, p.height * 0.72, p.depth * 0.02), p.width * 0.012), moved(roundedBox({ width: p.width * 0.22, height: p.height * 0.18, depth: p.depth * 0.04, radius: p.width * 0.025, steps: 2 }), -p.width * 0.62, p.height * 0.78, p.depth * 0.02, -0.12)], p.accentColor, "plastic"),
  ];
}

function wineCabinet(p: BlendReferenceInteriorParams): NamedPart[] {
  const bays = Math.max(4, Math.min(10, Math.round(p.modules)));
  const sideW = p.width * 0.055;
  const bayW = (p.width - sideW * 2) / bays;
  const centerY = p.height * 0.5;
  const openingH = p.height * 0.38;
  const carcass = [
    moved(box(p.width, p.height * 0.035, p.depth), 0, p.height * 0.9825, 0),
    moved(box(p.width, p.height * 0.035, p.depth), 0, p.height * 0.0175, 0),
    moved(box(sideW, p.height, p.depth), -p.width * 0.5 + sideW * 0.5, centerY, 0),
    moved(box(sideW, p.height, p.depth), p.width * 0.5 - sideW * 0.5, centerY, 0),
    moved(box(p.width, p.height, p.depth * 0.08), 0, centerY, -p.depth * 0.46),
  ];
  const doors: Mesh[] = [];
  const dividers: Mesh[] = [];
  const shelves: Mesh[] = [];
  for (let bay = 0; bay < bays; bay++) {
    const x = -p.width * 0.5 + sideW + bayW * (bay + 0.5);
    doors.push(moved(box(bayW * 0.965, p.height * 0.29, p.depth * 0.035), x, p.height * 0.82, p.depth * 0.51));
    doors.push(moved(box(bayW * 0.965, p.height * 0.29, p.depth * 0.035), x, p.height * 0.18, p.depth * 0.51));
    if (bay > 0) dividers.push(moved(box(p.width * 0.008, openingH, p.depth * 0.86), x - bayW * 0.5, centerY, 0));
    if (bay % 2 === 0) shelves.push(moved(box(bayW * 1.85, p.height * 0.012, p.depth * 0.82), x + bayW * 0.48, centerY, 0));
  }
  return [
    part("wine_cabinet_carcass", "整墙柜体", carcass, p.primaryColor, "wood"),
    part("wine_cabinet_doors", "上下无拉手门板", doors, p.primaryColor, "wood"),
    part("wine_cabinet_dividers", "开放格竖隔板", dividers, p.accentColor, "wood"),
    part("wine_cabinet_shelves", "错落开放层板", shelves, p.accentColor, "wood"),
  ];
}

function sideTable(p: BlendReferenceInteriorParams): NamedPart[] {
  const hub = vec3(0, p.height * 0.2, 0);
  const legCount = Math.max(3, Math.min(5, Math.round(p.modules)));
  const legs = Array.from({ length: legCount }, (_, index) => {
    const angle = index / legCount * Math.PI * 2 + Math.PI * 0.15;
    return tubeBetween(hub, vec3(Math.cos(angle) * p.width * 0.45, p.height * 0.045, Math.sin(angle) * p.depth * 0.45), p.width * 0.018, 10);
  });
  return [
    part("side_table_top", "薄圆形台面", moved(cylinder(p.width * 0.5, p.height * 0.055, 56, true), 0, p.height * 0.94, 0), p.primaryColor, "stone"),
    part("side_table_column", "锥形中央支柱", moved(lathe([vec2(p.width * 0.05, 0), vec2(p.width * 0.032, p.height * 0.55), vec2(p.width * 0.018, p.height * 0.72)], { segments: 24 }), 0, p.height * 0.2, 0), p.accentColor, "metal"),
    part("side_table_tripod", "放射三脚底架", legs, p.accentColor, "metal"),
  ];
}

function bookRow(p: BlendReferenceInteriorParams): NamedPart[] {
  const count = Math.max(3, Math.min(18, Math.round(p.modules)));
  const bookW = p.width / count;
  const covers: Mesh[] = [];
  const pages: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const x = -p.width * 0.5 + bookW * (index + 0.5);
    const height = p.height * (0.9 + (index % 3) * 0.03);
    covers.push(moved(roundedBox({ width: bookW * 0.94, height, depth: p.depth, radius: bookW * 0.05, steps: 1 }), x, height * 0.5, 0));
    pages.push(moved(box(bookW * 0.74, height * 0.92, p.depth * 0.93), x, height * 0.5, p.depth * 0.02));
  }
  return [
    part("book_covers", "并列精装书封", covers, p.primaryColor, "leather"),
    part("book_page_blocks", "内缩纸页块", pages, p.accentColor, "paper"),
  ];
}

function bottle(width: number, height: number): Mesh {
  const outerSurface = lathe([
    vec2(width * 0.36, 0), vec2(width * 0.42, height * 0.04), vec2(width * 0.42, height * 0.62),
    vec2(width * 0.26, height * 0.72), vec2(width * 0.14, height * 0.78), vec2(width * 0.14, height),
  ], { segments: 28 });
  return solidify(outerSurface, { thickness: width * 0.045, offset: 0 });
}

function wineGlass(width: number, height: number): Mesh {
  const outerSurface = lathe([
    vec2(width * 0.28, 0), vec2(width * 0.06, height * 0.02), vec2(width * 0.025, height * 0.44),
    vec2(width * 0.25, height * 0.5), vec2(width * 0.42, height * 0.72), vec2(width * 0.34, height),
  ], { segments: 24 });
  return solidify(outerSurface, { thickness: width * 0.035, offset: 0 });
}

function barAccessories(p: BlendReferenceInteriorParams): NamedPart[] {
  const bottles = [
    moved(bottle(p.width * 0.18, p.height * 0.88), -p.width * 0.22, p.height * 0.06, 0),
    moved(bottle(p.width * 0.15, p.height * 0.72), -p.width * 0.04, p.height * 0.06, p.depth * 0.08),
  ];
  const glasses = [-0.02, 0.14, 0.29].map((x, index) => moved(wineGlass(p.width * 0.16, p.height * (0.48 + index * 0.04)), p.width * x, p.height * 0.05, -p.depth * 0.08 + index * p.depth * 0.045));
  return [
    part("bar_tray", "低边金属托盘", [moved(roundedBox({ width: p.width, height: p.height * 0.035, depth: p.depth, radius: p.width * 0.03, steps: 2 }), 0, p.height * 0.02, 0), moved(torus(p.width * 0.41, p.width * 0.009, 40, 6), 0, p.height * 0.06, 0)], p.accentColor, "metal"),
    part("bar_bottles", "双规格酒瓶", bottles, p.primaryColor, "glass"),
    part("bar_glasses", "高脚杯组", glasses, GLASS, "glass"),
  ];
}

function tvWall(p: BlendReferenceInteriorParams): NamedPart[] {
  const sideW = p.width * 0.18;
  const innerW = p.width - sideW * 2;
  const frameH = p.height * 0.13;
  const shelves = [-1, 1].flatMap((side) => [0.32, 0.5, 0.68].map((ratio) => moved(box(sideW * 0.72, p.height * 0.018, p.depth * 0.74), side * p.width * 0.37, p.height * ratio, 0)));
  return [
    part("tv_wall_frame", "厚边背景墙框", [moved(box(p.width, frameH, p.depth), 0, p.height - frameH * 0.5, 0), moved(box(p.width, frameH, p.depth), 0, frameH * 0.5, 0), moved(box(sideW, p.height, p.depth), -p.width * 0.5 + sideW * 0.5, p.height * 0.5, 0), moved(box(sideW, p.height, p.depth), p.width * 0.5 - sideW * 0.5, p.height * 0.5, 0)], p.primaryColor, "stone"),
    part("tv_wall_recess", "内凹电视墙面", moved(box(innerW, p.height - frameH * 2, p.depth * 0.22), 0, p.height * 0.5, -p.depth * 0.36), p.primaryColor, "stone"),
    part("tv_screen", "悬浮电视面板", moved(roundedBox({ width: innerW * 0.72, height: p.height * 0.48, depth: p.depth * 0.09, radius: p.width * 0.006, steps: 1 }), 0, p.height * 0.53, -p.depth * 0.18), p.accentColor, "glass"),
    part("tv_side_shelves", "双侧展示层板", shelves, p.primaryColor, "stone"),
    part("tv_floating_console", "分离式悬浮电视柜", moved(roundedBox({ width: p.width * 0.92, height: p.height * 0.1, depth: p.depth * 0.72, radius: p.height * 0.012, steps: 2 }), 0, -p.height * 0.12, p.depth * 0.08), p.primaryColor, "wood"),
  ];
}

const BUILDERS: Record<BlendReferenceInteriorKind, (params: BlendReferenceInteriorParams) => NamedPart[]> = {
  curtain,
  "venetian-blind": venetianBlind,
  "european-door": europeanDoor,
  "table-lamp": tableLamp,
  "floor-lamp": floorLamp,
  "sculptural-chandelier": sculpturalChandelier,
  copier,
  "service-kiosk": serviceKiosk,
  "massage-chair": massageChair,
  "wine-cabinet": wineCabinet,
  "side-table": sideTable,
  "book-row": bookRow,
  "bar-accessories": barAccessories,
  "tv-wall": tvWall,
};

export function buildBlendReferenceInteriorParts(
  params: Pick<BlendReferenceInteriorParams, "kind"> & Partial<Omit<BlendReferenceInteriorParams, "kind">>,
): NamedPart[] {
  const definition = BLEND_REFERENCE_INTERIORS.find((entry) => entry.defaults.kind === params.kind);
  if (!definition) throw new Error(`Unknown Blender reference interior kind: ${params.kind}`);
  const resolved: BlendReferenceInteriorParams = { ...definition.defaults, ...params };
  return BUILDERS[resolved.kind](resolved);
}
