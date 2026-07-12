import {
  box,
  cylinder,
  merge,
  polyline,
  sphere,
  sweep,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type BathroomFixtureKind =
  | "shower-enclosure"
  | "bathtub"
  | "toilet"
  | "vanity"
  | "mirror-cabinet";

export type BathroomAnchorType =
  | "floor"
  | "wall"
  | "hot-water"
  | "cold-water"
  | "drain"
  | "electrical"
  | "connection-left"
  | "connection-right";

export interface BathroomFixtureParams {
  kind: BathroomFixtureKind;
  width: number;
  height: number;
  depth: number;
  openness: number;
  detail: number;
}

export interface BathroomFixtureDefinition {
  id: string;
  name: string;
  kind: BathroomFixtureKind;
  anchors: BathroomAnchorType[];
  defaults: BathroomFixtureParams;
}

export type BathroomSuiteKind = "compact" | "standard" | "spa";

export interface BathroomSuiteParams {
  kind: BathroomSuiteKind;
  width: number;
  height: number;
  depth: number;
  openness: number;
  detail: number;
}

export interface BathroomSuiteDefinition {
  id: string;
  name: string;
  kind: BathroomSuiteKind;
  defaults: BathroomSuiteParams;
}

export type BathroomLayoutSeverity = "warning" | "error";

export interface BathroomLayoutIssue {
  code: "insufficient-room" | "out-of-bounds" | "fixture-overlap" | "door-clearance" | "narrow-aisle";
  severity: BathroomLayoutSeverity;
  message: string;
  fixtures: string[];
}

interface BathroomAnchor {
  type: BathroomAnchorType;
  position: [number, number, number];
}

interface FixturePlacement {
  id: string;
  label: string;
  params: BathroomFixtureParams;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

interface Footprint {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const WHITE: RGB = [0.93, 0.94, 0.92];
const CERAMIC: RGB = [0.88, 0.9, 0.88];
const STONE: RGB = [0.52, 0.54, 0.53];
const LIGHT_STONE: RGB = [0.72, 0.73, 0.7];
const WOOD: RGB = [0.48, 0.29, 0.15];
const LIGHT_WOOD: RGB = [0.68, 0.48, 0.28];
const METAL: RGB = [0.45, 0.5, 0.54];
const DARK_METAL: RGB = [0.12, 0.14, 0.16];
const GLASS: RGB = [0.32, 0.68, 0.78];
const MIRROR: RGB = [0.5, 0.67, 0.72];
const WATER_PIPE: RGB = [0.62, 0.66, 0.68];
const HOT_PIPE: RGB = [0.72, 0.2, 0.13];
const COLD_PIPE: RGB = [0.12, 0.35, 0.72];
const FLOOR: RGB = [0.56, 0.57, 0.54];
const WALL: RGB = [0.82, 0.82, 0.78];

function fixtureDefinition(
  kind: BathroomFixtureKind,
  name: string,
  anchors: BathroomAnchorType[],
  width: number,
  height: number,
  depth: number,
): BathroomFixtureDefinition {
  return {
    id: `bathroom-${kind}`,
    name,
    kind,
    anchors,
    defaults: { kind, width, height, depth, openness: 0, detail: 1 },
  };
}

export const BATHROOM_FIXTURE_MODELS: BathroomFixtureDefinition[] = [
  fixtureDefinition("shower-enclosure", "滑门淋浴房", ["floor", "wall", "hot-water", "cold-water", "drain"], 0.95, 2.15, 0.95),
  fixtureDefinition("bathtub", "带龙头独立浴缸", ["floor", "wall", "hot-water", "cold-water", "drain"], 1.75, 0.62, 0.78),
  fixtureDefinition("toilet", "壁排水箱马桶", ["floor", "wall", "cold-water", "drain"], 0.48, 0.82, 0.72),
  fixtureDefinition("vanity", "开孔浴室柜", ["floor", "wall", "hot-water", "cold-water", "drain", "connection-left", "connection-right"], 1.1, 1.02, 0.56),
  fixtureDefinition("mirror-cabinet", "可开启镜柜", ["wall", "electrical", "connection-left", "connection-right"], 0.9, 0.78, 0.16),
];

export const BATHROOM_SUITE_MODELS: BathroomSuiteDefinition[] = [
  {
    id: "bathroom-suite-compact",
    name: "小型卫浴组合",
    kind: "compact",
    defaults: { kind: "compact", width: 2.45, height: 2.65, depth: 2.2, openness: 0.35, detail: 1 },
  },
  {
    id: "bathroom-suite-standard",
    name: "中型卫浴组合",
    kind: "standard",
    defaults: { kind: "standard", width: 3.6, height: 2.7, depth: 3.1, openness: 0.35, detail: 1 },
  },
  {
    id: "bathroom-suite-spa",
    name: "大型干湿分区卫浴",
    kind: "spa",
    defaults: { kind: "spa", width: 5.2, height: 2.9, depth: 4.2, openness: 0.35, detail: 1 },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function scaled(mesh: Mesh, x: number, y: number, z: number, scaleX: number, scaleY: number, scaleZ: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, {
    translate: vec3(x, y, z),
    rotate: vec3(rx, ry, rz),
    scale: vec3(scaleX, scaleY, scaleZ),
  });
}

function part(
  name: string,
  label: string,
  meshes: Mesh | Mesh[],
  color: RGB,
  materialSlot: string,
  surfaceType: string,
  metadata: Record<string, unknown> = {},
): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  const resolvedSurfaceType = surfaceType === "pipe" ? "metal" : surfaceType;
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: resolvedSurfaceType, params: { color, roughness: resolvedSurfaceType === "metal" ? 0.28 : 0.62 } },
    metadata: { materialSlot, collision: surfaceType === "pipe" ? "mesh" : "box", ...metadata },
  };
}

function pipe(points: Array<[number, number, number]>, radius: number, detail: number): Mesh {
  return sweep(polyline(points.map(([x, y, z]) => vec3(x, y, z))), {
    radius,
    sides: detail >= 0.5 ? 12 : 6,
    caps: true,
  });
}

function slabAroundOpening(
  width: number,
  depth: number,
  thickness: number,
  openingWidth: number,
  openingDepth: number,
  centerX: number,
  centerZ: number,
  centerY: number,
): Mesh[] {
  const leftWidth = centerX - openingWidth * 0.5 + width * 0.5;
  const rightWidth = width * 0.5 - centerX - openingWidth * 0.5;
  const backDepth = centerZ - openingDepth * 0.5 + depth * 0.5;
  const frontDepth = depth * 0.5 - centerZ - openingDepth * 0.5;
  const meshes: Mesh[] = [];
  if (leftWidth > 0) meshes.push(moved(box(leftWidth, thickness, depth), -width * 0.5 + leftWidth * 0.5, centerY, 0));
  if (rightWidth > 0) meshes.push(moved(box(rightWidth, thickness, depth), width * 0.5 - rightWidth * 0.5, centerY, 0));
  if (backDepth > 0) meshes.push(moved(box(openingWidth, thickness, backDepth), centerX, centerY, -depth * 0.5 + backDepth * 0.5));
  if (frontDepth > 0) meshes.push(moved(box(openingWidth, thickness, frontDepth), centerX, centerY, depth * 0.5 - frontDepth * 0.5));
  return meshes;
}

function anchorPositions(kind: BathroomFixtureKind, params: BathroomFixtureParams): Record<BathroomAnchorType, [number, number, number]> {
  const rear = -params.depth * 0.5;
  return {
    floor: [0, 0, 0],
    wall: [0, params.height * 0.5, rear],
    "hot-water": [-Math.min(0.12, params.width * 0.18), Math.min(0.58, params.height * 0.45), rear],
    "cold-water": [Math.min(0.12, params.width * 0.18), Math.min(0.58, params.height * 0.45), rear],
    drain: [kind === "toilet" ? 0 : params.width * 0.08, 0, kind === "bathtub" ? params.depth * 0.2 : 0],
    electrical: [params.width * 0.35, params.height * 0.72, rear],
    "connection-left": [-params.width * 0.5, params.height * 0.5, 0],
    "connection-right": [params.width * 0.5, params.height * 0.5, 0],
  };
}

function attachFixtureMetadata(
  parts: NamedPart[],
  definition: BathroomFixtureDefinition,
  params: BathroomFixtureParams,
): NamedPart[] {
  const positions = anchorPositions(definition.kind, params);
  const anchors: BathroomAnchor[] = definition.anchors.map((type) => ({ type, position: positions[type] }));
  return parts.map((entry) => ({
    ...entry,
    metadata: {
      ...entry.metadata,
      fixtureKind: definition.kind,
      anchors,
      lod: params.detail >= 0.5 ? "high" : "preview",
      deterministic: true,
    },
  }));
}

function buildShower(params: BathroomFixtureParams): NamedPart[] {
  const { width, height, depth, detail, openness } = params;
  const trayThickness = Math.max(0.055, height * 0.032);
  const frame = Math.max(0.018, width * 0.025);
  const drainSize = Math.min(width, depth) * 0.16;
  const glassHeight = height * 0.88;
  const panelHeight = glassHeight - frame * 1.2;
  const panelY = trayThickness + panelHeight * 0.5;
  const doorWidth = (width - frame * 3) * 0.5;
  const doorOffset = openness * doorWidth * 0.58;
  const tray = slabAroundOpening(width, depth, trayThickness, drainSize, drainSize, 0, 0, trayThickness * 0.5);
  const glass = [
    moved(box(frame * 0.42, panelHeight, depth - frame * 2.4), -width * 0.5 + frame * 1.4, panelY, 0),
    moved(box(frame * 0.42, panelHeight, depth - frame * 2.4), width * 0.5 - frame * 1.4, panelY, 0),
    moved(box(doorWidth, panelHeight, frame * 0.42), -doorWidth * 0.5 + doorOffset, panelY, depth * 0.5 - frame * 1.42),
    moved(box(doorWidth, panelHeight, frame * 0.42), doorWidth * 0.5 - doorOffset, panelY, depth * 0.5 - frame * 1.78),
  ];
  const posts = [
    moved(box(frame, glassHeight, frame), -width * 0.5 + frame * 0.68, trayThickness + glassHeight * 0.5, depth * 0.5 - frame * 0.68),
    moved(box(frame, glassHeight, frame), width * 0.5 - frame * 0.68, trayThickness + glassHeight * 0.5, depth * 0.5 - frame * 0.68),
    moved(box(width, frame, frame), 0, trayThickness + glassHeight, depth * 0.5),
  ];
  const riser = pipe([
    [0, height * 0.2, -depth * 0.5 + frame * 1.5],
    [0, height * 0.76, -depth * 0.5 + frame * 1.5],
    [0, height * 0.84, -depth * 0.5 + depth * 0.14],
  ], Math.max(0.009, width * 0.012), detail);
  const parts = [
    part("shower_tray", "淋浴底盘与真实地漏开孔", tray, WHITE, "ceramic", "ceramic", { opening: { type: "drain", width: drainSize, depth: drainSize } }),
    part("shower_drain", "淋浴地漏", moved(box(drainSize * 0.82, trayThickness * 0.22, drainSize * 0.82), 0, trayThickness * 0.22, 0), DARK_METAL, "drain", "metal"),
    part("shower_glass", "淋浴房玻璃与滑门", glass, GLASS, "glass", "glass", {
      joint: { type: "slider", axis: [1, 0, 0], state: openness, travel: doorWidth * 0.58 },
    }),
    part("shower_frame", "淋浴房金属框", posts, METAL, "frame", "metal"),
    part("shower_riser", "扫掠花洒管", riser, WATER_PIPE, "plumbing", "pipe"),
    part("shower_head", "顶喷花洒", moved(cylinder(width * 0.13, frame * 0.6, detail >= 0.5 ? 24 : 12), 0, height * 0.84, -depth * 0.5 + depth * 0.28, Math.PI * 0.5), METAL, "hardware", "metal"),
  ];
  if (detail >= 0.5) {
    parts.push(part("shower_controls", "冷热水控制阀", [
      moved(cylinder(width * 0.055, frame * 0.7, 16), 0, height * 0.48, -depth * 0.5 + frame, Math.PI * 0.5),
      moved(box(width * 0.2, height * 0.035, frame * 0.7), 0, height * 0.48, -depth * 0.5 + frame),
    ], METAL, "hardware", "metal"));
  }
  return parts;
}

function buildBathtub(params: BathroomFixtureParams): NamedPart[] {
  const { width, height, depth, detail } = params;
  const rim = Math.max(0.04, Math.min(width, depth) * 0.065);
  const innerWidth = width - rim * 2;
  const innerDepth = depth - rim * 2;
  const drainSize = Math.min(0.1, depth * 0.13);
  const drainX = width * 0.3;
  const shell = [
    moved(box(width, height * 0.72, rim), 0, height * 0.36, -depth * 0.5 + rim * 0.5),
    moved(box(width, height * 0.72, rim), 0, height * 0.36, depth * 0.5 - rim * 0.5),
    moved(box(rim, height * 0.72, innerDepth), -width * 0.5 + rim * 0.5, height * 0.36, 0),
    moved(box(rim, height * 0.72, innerDepth), width * 0.5 - rim * 0.5, height * 0.36, 0),
  ];
  const basinFloor = slabAroundOpening(innerWidth, innerDepth, rim * 0.6, drainSize, drainSize, drainX, depth * 0.12, height * 0.16);
  const rimMeshes = [
    moved(box(width, rim, rim), 0, height - rim * 0.5, -depth * 0.5 + rim * 0.5),
    moved(box(width, rim, rim), 0, height - rim * 0.5, depth * 0.5 - rim * 0.5),
    moved(box(rim, rim, innerDepth), -width * 0.5 + rim * 0.5, height - rim * 0.5, 0),
    moved(box(rim, rim, innerDepth), width * 0.5 - rim * 0.5, height - rim * 0.5, 0),
  ];
  const tapX = -width * 0.28;
  const faucet = pipe([
    [tapX, height * 0.7, -depth * 0.5],
    [tapX, height * 1.08, -depth * 0.5],
    [tapX, height * 1.12, -depth * 0.34],
  ], rim * 0.2, detail);
  const parts = [
    part("bathtub_shell", "浴缸外壳", shell, WHITE, "ceramic", "ceramic"),
    part("bathtub_basin", "浴缸内盆与真实排水孔", basinFloor, CERAMIC, "ceramic", "ceramic", { opening: { type: "drain", center: [drainX, height * 0.16, depth * 0.12], size: drainSize } }),
    part("bathtub_rim", "浴缸连续边沿", rimMeshes, WHITE, "ceramic", "ceramic"),
    part("bathtub_drain", "浴缸排水口", moved(cylinder(drainSize * 0.42, rim * 0.18, 16), drainX, height * 0.17, depth * 0.12), DARK_METAL, "drain", "metal"),
    part("bathtub_faucet", "扫掠浴缸龙头", faucet, METAL, "plumbing", "pipe"),
  ];
  if (detail >= 0.5) {
    parts.push(part("bathtub_overflow", "浴缸溢水口", moved(cylinder(rim * 0.42, rim * 0.18, 16), drainX, height * 0.56, -depth * 0.5 + rim, Math.PI * 0.5), METAL, "drain", "metal"));
  }
  return parts;
}

function buildToilet(params: BathroomFixtureParams): NamedPart[] {
  const { width, height, depth, detail, openness } = params;
  const bowlRadius = width * 0.32;
  const bowlY = height * 0.42;
  const bowlZ = depth * 0.08;
  const lidAngle = -openness * Math.PI * 0.44;
  const parts = [
    part("toilet_base", "马桶落地底座", scaled(sphere(0.5, 18, 12), 0, height * 0.22, -depth * 0.04, width * 0.66, height * 0.55, depth * 0.52), CERAMIC, "ceramic", "ceramic"),
    part("toilet_bowl", "马桶坐便器", scaled(torus(bowlRadius, width * 0.065, detail >= 0.5 ? 28 : 16, 8), 0, bowlY, bowlZ, 1, 1, depth / width * 0.72), CERAMIC, "ceramic", "ceramic"),
    part("toilet_tank", "马桶水箱", moved(box(width * 0.82, height * 0.46, depth * 0.3), 0, height * 0.69, -depth * 0.34), CERAMIC, "ceramic", "ceramic"),
    part("toilet_lid", "可开启马桶盖", scaled(torus(bowlRadius * 0.98, width * 0.045, detail >= 0.5 ? 28 : 16, 6), 0, bowlY + width * 0.035, bowlZ - openness * depth * 0.08, 1, 1, depth / width * 0.72, lidAngle), WHITE, "seat", "plastic", {
      joint: { type: "hinge", axis: [1, 0, 0], state: openness, pivot: [0, bowlY, -depth * 0.16] },
    }),
    part("toilet_flush", "水箱冲水按钮", moved(cylinder(width * 0.055, height * 0.025, 16), width * 0.22, height * 0.93, -depth * 0.34), METAL, "hardware", "metal"),
  ];
  if (detail >= 0.5) {
    parts.push(part("toilet_supply", "扫掠进水软管", pipe([
      [width * 0.28, height * 0.14, -depth * 0.5],
      [width * 0.28, height * 0.34, -depth * 0.42],
      [width * 0.22, height * 0.5, -depth * 0.36],
    ], width * 0.018, detail), WATER_PIPE, "plumbing", "pipe"));
  }
  return parts;
}

function hingedPanel(width: number, height: number, depth: number, hingeX: number, centerY: number, frontZ: number, direction: -1 | 1, openness: number): Mesh {
  const angle = direction * openness * Math.PI * 0.46;
  const halfWidth = width * 0.5;
  const centerX = hingeX + direction * halfWidth * Math.cos(angle);
  const centerZ = frontZ - direction * halfWidth * Math.sin(angle);
  return moved(box(width, height, depth), centerX, centerY, centerZ, 0, angle);
}

function buildVanity(params: BathroomFixtureParams): NamedPart[] {
  const { width, height, depth, detail, openness } = params;
  const thickness = Math.max(0.025, Math.min(width, height) * 0.04);
  const cabinetHeight = height * 0.82;
  const basinWidth = Math.min(width * 0.48, 0.62);
  const basinDepth = Math.min(depth * 0.56, 0.36);
  const countertop = slabAroundOpening(width * 1.04, depth * 1.04, thickness * 1.45, basinWidth, basinDepth, 0, 0, cabinetHeight + thickness * 0.72);
  const shell = [
    moved(box(width, thickness, depth), 0, thickness * 0.5, 0),
    moved(box(thickness, cabinetHeight, depth), -width * 0.5 + thickness * 0.5, cabinetHeight * 0.5, 0),
    moved(box(thickness, cabinetHeight, depth), width * 0.5 - thickness * 0.5, cabinetHeight * 0.5, 0),
    moved(box(width, cabinetHeight, thickness), 0, cabinetHeight * 0.5, -depth * 0.5 + thickness * 0.5),
  ];
  const doorWidth = (width - thickness * 2.4) * 0.5;
  const frontZ = depth * 0.5 + thickness * 0.18;
  const doors = [
    hingedPanel(doorWidth, cabinetHeight * 0.78, thickness * 0.65, -width * 0.5 + thickness, cabinetHeight * 0.47, frontZ, 1, openness),
    hingedPanel(doorWidth, cabinetHeight * 0.78, thickness * 0.65, width * 0.5 - thickness, cabinetHeight * 0.47, frontZ, -1, openness),
  ];
  const basin = [
    moved(box(basinWidth, thickness * 0.55, basinDepth), 0, cabinetHeight - thickness * 1.15, 0),
    moved(box(basinWidth, thickness * 1.04, thickness * 0.45), 0, cabinetHeight - thickness * 0.56, -basinDepth * 0.5),
    moved(box(basinWidth, thickness * 1.04, thickness * 0.45), 0, cabinetHeight - thickness * 0.56, basinDepth * 0.5),
    moved(box(thickness * 0.45, thickness * 1.04, basinDepth), -basinWidth * 0.5, cabinetHeight - thickness * 0.56, 0),
    moved(box(thickness * 0.45, thickness * 1.04, basinDepth), basinWidth * 0.5, cabinetHeight - thickness * 0.56, 0),
  ];
  const faucet = pipe([
    [basinWidth * 0.32, cabinetHeight + thickness, -basinDepth * 0.5],
    [basinWidth * 0.32, height, -basinDepth * 0.5],
    [basinWidth * 0.32, height, -basinDepth * 0.12],
  ], thickness * 0.23, detail);
  const parts = [
    part("vanity_carcass", "浴室柜柜体", shell, WOOD, "cabinet", "wood"),
    part("vanity_doors", "可开启浴室柜门", doors, LIGHT_WOOD, "front", "wood", {
      joint: { type: "hinge-pair", axis: [0, 1, 0], state: openness, angle: openness * Math.PI * 0.46 },
    }),
    part("vanity_countertop", "带真实面盆开孔台面", countertop, STONE, "countertop", "stone", { opening: { type: "basin", width: basinWidth, depth: basinDepth } }),
    part("vanity_basin", "下嵌式洗手盆", basin, WHITE, "ceramic", "ceramic"),
    part("vanity_faucet", "扫掠洗手盆龙头", faucet, METAL, "plumbing", "pipe"),
  ];
  if (detail >= 0.5) {
    parts.push(
      part("vanity_supplies", "冷热水扫掠管线", [
        pipe([[-width * 0.1, 0.18, -depth * 0.5], [-width * 0.1, cabinetHeight * 0.46, -depth * 0.22], [-width * 0.08, cabinetHeight * 0.72, 0]], thickness * 0.16, detail),
        pipe([[width * 0.1, 0.18, -depth * 0.5], [width * 0.1, cabinetHeight * 0.46, -depth * 0.22], [width * 0.08, cabinetHeight * 0.72, 0]], thickness * 0.16, detail),
      ], WATER_PIPE, "plumbing", "pipe", { channels: ["hot-water", "cold-water"] }),
      part("vanity_drain", "洗手盆排水管", pipe([[0, cabinetHeight * 0.7, 0], [0, cabinetHeight * 0.42, 0], [0, cabinetHeight * 0.28, -depth * 0.5]], thickness * 0.24, detail), DARK_METAL, "drain", "pipe"),
    );
  }
  return parts;
}

function buildMirrorCabinet(params: BathroomFixtureParams): NamedPart[] {
  const { width, height, depth, detail, openness } = params;
  const thickness = Math.max(0.018, Math.min(width, height) * 0.035);
  const frontZ = depth * 0.5 + thickness * 0.2;
  const door = hingedPanel(width - thickness * 1.5, height - thickness * 1.5, thickness * 0.45, -width * 0.5 + thickness, height * 0.5, frontZ, 1, openness);
  const shell = [
    moved(box(width, thickness, depth), 0, thickness * 0.5, 0),
    moved(box(width, thickness, depth), 0, height - thickness * 0.5, 0),
    moved(box(thickness, height, depth), -width * 0.5 + thickness * 0.5, height * 0.5, 0),
    moved(box(thickness, height, depth), width * 0.5 - thickness * 0.5, height * 0.5, 0),
    moved(box(width, height, thickness), 0, height * 0.5, -depth * 0.5 + thickness * 0.5),
  ];
  const parts = [
    part("mirror_cabinet", "镜柜柜体", shell, LIGHT_WOOD, "cabinet", "wood"),
    part("mirror_door", "可开启镜面门", door, MIRROR, "mirror", "glass", {
      joint: { type: "hinge", axis: [0, 1, 0], state: openness, pivot: [-width * 0.5 + thickness, height * 0.5, frontZ] },
    }),
    part("mirror_light", "镜柜照明", moved(box(width * 0.72, thickness * 0.65, depth * 0.35), 0, height + thickness * 0.55, depth * 0.18), WHITE, "electrical", "plastic"),
  ];
  if (detail >= 0.5) {
    parts.push(part("mirror_shelves", "镜柜内部层板", [0.34, 0.66].map((ratio) => moved(box(width - thickness * 2, thickness * 0.45, depth - thickness * 2), 0, height * ratio, 0)), GLASS, "glass", "glass"));
  }
  return parts;
}

function resolveFixtureParams(input: Partial<BathroomFixtureParams>): BathroomFixtureParams {
  const kind = input.kind ?? "shower-enclosure";
  const definition = BATHROOM_FIXTURE_MODELS.find((entry) => entry.kind === kind)!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 0.28, 4),
    height: clamp(input.height ?? definition.defaults.height, 0.35, 3.6),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.12, 2.4),
    openness: clamp(input.openness ?? definition.defaults.openness, 0, 1),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

export function buildBathroomFixtureParts(input: Partial<BathroomFixtureParams> = {}): NamedPart[] {
  const params = resolveFixtureParams(input);
  const definition = BATHROOM_FIXTURE_MODELS.find((entry) => entry.kind === params.kind)!;
  const parts = params.kind === "shower-enclosure"
    ? buildShower(params)
    : params.kind === "bathtub"
      ? buildBathtub(params)
      : params.kind === "toilet"
        ? buildToilet(params)
        : params.kind === "vanity"
          ? buildVanity(params)
          : buildMirrorCabinet(params);
  return attachFixtureMetadata(parts, definition, params);
}

function fixtureParams(kind: BathroomFixtureKind, input: Partial<BathroomFixtureParams>): BathroomFixtureParams {
  return resolveFixtureParams({ ...input, kind });
}

function suitePlacements(params: BathroomSuiteParams): FixturePlacement[] {
  const wall = 0.14;
  const backZ = -params.depth * 0.5 + wall;
  const leftX = -params.width * 0.5 + wall;
  const rightX = params.width * 0.5 - wall;
  const common = { openness: params.openness, detail: params.detail };
  if (params.kind === "compact") {
    const showerWidth = Math.min(0.9, params.width * 0.39);
    const showerDepth = Math.min(0.9, params.depth * 0.42);
    const vanityWidth = Math.min(0.78, params.depth * 0.38);
    const vanityDepth = Math.min(0.5, params.width * 0.22);
    return [
      { id: "shower", label: "淋浴房", params: fixtureParams("shower-enclosure", { ...common, width: showerWidth, depth: showerDepth }), x: leftX + showerWidth * 0.5, y: 0, z: backZ + showerDepth * 0.5, rotationY: 0 },
      { id: "toilet", label: "马桶", params: fixtureParams("toilet", { ...common, width: 0.46, depth: 0.68 }), x: rightX - 0.23, y: 0, z: backZ + 0.34, rotationY: 0 },
      { id: "vanity", label: "浴室柜", params: fixtureParams("vanity", { ...common, width: vanityWidth, depth: vanityDepth }), x: leftX + vanityDepth * 0.5, y: 0, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
      { id: "mirror", label: "镜柜", params: fixtureParams("mirror-cabinet", { ...common, width: vanityWidth * 0.9, depth: 0.14 }), x: leftX + 0.08, y: 1.15, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
    ];
  }
  if (params.kind === "standard") {
    const tubWidth = Math.min(1.7, params.width * 0.48);
    const showerWidth = Math.min(0.95, params.width * 0.28);
    const vanityWidth = Math.min(1.15, params.depth * 0.42);
    return [
      { id: "bathtub", label: "浴缸", params: fixtureParams("bathtub", { ...common, width: tubWidth, depth: 0.76 }), x: leftX + tubWidth * 0.5, y: 0, z: backZ + 0.38, rotationY: 0 },
      { id: "shower", label: "淋浴房", params: fixtureParams("shower-enclosure", { ...common, width: showerWidth, depth: 0.92 }), x: rightX - showerWidth * 0.5, y: 0, z: backZ + 0.46, rotationY: 0 },
      { id: "toilet", label: "马桶", params: fixtureParams("toilet", { ...common, width: 0.48, depth: 0.72 }), x: rightX - 0.36, y: 0, z: params.depth * 0.08, rotationY: -Math.PI * 0.5 },
      { id: "vanity", label: "浴室柜", params: fixtureParams("vanity", { ...common, width: vanityWidth, depth: 0.56 }), x: leftX + 0.28, y: 0, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
      { id: "mirror", label: "镜柜", params: fixtureParams("mirror-cabinet", { ...common, width: vanityWidth * 0.88, depth: 0.15 }), x: leftX + 0.08, y: 1.2, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
    ];
  }
  const tubWidth = Math.min(2, params.width * 0.43);
  const showerWidth = Math.min(1.25, params.width * 0.25);
  const vanityWidth = Math.min(1.75, params.depth * 0.44);
  return [
    { id: "bathtub", label: "独立浴缸", params: fixtureParams("bathtub", { ...common, width: tubWidth, depth: 0.9 }), x: leftX + tubWidth * 0.5, y: 0, z: backZ + 0.45, rotationY: 0 },
    { id: "shower", label: "步入式淋浴房", params: fixtureParams("shower-enclosure", { ...common, width: showerWidth, depth: 1.15 }), x: rightX - showerWidth * 0.5, y: 0, z: backZ + 0.575, rotationY: 0 },
    { id: "toilet", label: "马桶", params: fixtureParams("toilet", { ...common, width: 0.5, depth: 0.74 }), x: rightX - 0.37, y: 0, z: params.depth * 0.08, rotationY: -Math.PI * 0.5 },
    { id: "vanity", label: "双人浴室柜", params: fixtureParams("vanity", { ...common, width: vanityWidth, depth: 0.62 }), x: leftX + 0.31, y: 0, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
    { id: "mirror", label: "双人镜柜", params: fixtureParams("mirror-cabinet", { ...common, width: vanityWidth * 0.9, depth: 0.17 }), x: leftX + 0.09, y: 1.22, z: params.depth * 0.5 - wall - vanityWidth * 0.5, rotationY: Math.PI * 0.5 },
  ];
}

function footprint(placement: FixturePlacement): Footprint {
  const cos = Math.abs(Math.cos(placement.rotationY));
  const sin = Math.abs(Math.sin(placement.rotationY));
  const width = placement.params.width * cos + placement.params.depth * sin;
  const depth = placement.params.depth * cos + placement.params.width * sin;
  return {
    id: placement.id,
    label: placement.label,
    minX: placement.x - width * 0.5,
    maxX: placement.x + width * 0.5,
    minZ: placement.z - depth * 0.5,
    maxZ: placement.z + depth * 0.5,
  };
}

function overlaps(first: Footprint, second: Footprint, margin = 0.015): boolean {
  return first.minX < second.maxX - margin
    && first.maxX > second.minX + margin
    && first.minZ < second.maxZ - margin
    && first.maxZ > second.minZ + margin;
}

function resolveSuiteParams(input: Partial<BathroomSuiteParams>): BathroomSuiteParams {
  const kind = input.kind ?? "compact";
  const definition = BATHROOM_SUITE_MODELS.find((entry) => entry.kind === kind)!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 1.6, 9),
    height: clamp(input.height ?? definition.defaults.height, 2.2, 4.2),
    depth: clamp(input.depth ?? definition.defaults.depth, 1.5, 8),
    openness: clamp(input.openness ?? definition.defaults.openness, 0, 1),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

export function analyzeBathroomLayout(input: Partial<BathroomSuiteParams> = {}): BathroomLayoutIssue[] {
  const params = resolveSuiteParams(input);
  const placements = suitePlacements(params);
  const footprints = placements.map(footprint);
  const issues: BathroomLayoutIssue[] = [];
  const minimumRoom = params.kind === "compact"
    ? { width: 2, depth: 1.8 }
    : params.kind === "standard"
      ? { width: 3.1, depth: 2.6 }
      : { width: 4.4, depth: 3.5 };
  if (params.width < minimumRoom.width || params.depth < minimumRoom.depth) {
    issues.push({
      code: "insufficient-room",
      severity: "error",
      message: `${params.kind} 组合至少需要 ${minimumRoom.width.toFixed(1)}m × ${minimumRoom.depth.toFixed(1)}m 净空间`,
      fixtures: [],
    });
  }
  const halfWidth = params.width * 0.5 - 0.1;
  const halfDepth = params.depth * 0.5 - 0.1;
  for (const entry of footprints) {
    if (entry.minX < -halfWidth || entry.maxX > halfWidth || entry.minZ < -halfDepth || entry.maxZ > halfDepth) {
      issues.push({ code: "out-of-bounds", severity: "error", message: `${entry.label}超出房间边界`, fixtures: [entry.id] });
    }
  }
  for (let firstIndex = 0; firstIndex < footprints.length; firstIndex++) {
    const first = footprints[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < footprints.length; secondIndex++) {
      const second = footprints[secondIndex]!;
      if ((first.id === "mirror" && second.id === "vanity") || (first.id === "vanity" && second.id === "mirror")) continue;
      if (overlaps(first, second)) {
        issues.push({ code: "fixture-overlap", severity: "error", message: `${first.label}与${second.label}发生穿插`, fixtures: [first.id, second.id] });
      }
    }
  }
  if (params.openness > 0.55) {
    const vanity = footprints.find((entry) => entry.id === "vanity");
    const toilet = footprints.find((entry) => entry.id === "toilet");
    if (vanity && toilet) {
      const clearance = { ...vanity, minX: vanity.minX - 0.28, maxX: vanity.maxX + 0.28, minZ: vanity.minZ - 0.28, maxZ: vanity.maxZ + 0.28 };
      if (overlaps(clearance, toilet)) {
        issues.push({ code: "door-clearance", severity: "warning", message: "浴室柜门开启范围接近马桶", fixtures: ["vanity", "toilet"] });
      }
    }
  }
  const occupiedWidth = footprints.reduce((maximum, entry) => Math.max(maximum, entry.maxX - entry.minX), 0);
  const aisle = Math.min(params.width, params.depth) - occupiedWidth;
  if (aisle < 0.62) {
    issues.push({ code: "narrow-aisle", severity: "warning", message: `净通道约 ${Math.max(0, aisle).toFixed(2)}m，低于 0.62m`, fixtures: [] });
  }
  return issues;
}

function rotatePointY(position: [number, number, number], rotationY: number): [number, number, number] {
  const [x, y, z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function placeFixturePart(entry: NamedPart, placement: FixturePlacement, suiteKind: BathroomSuiteKind, issues: BathroomLayoutIssue[]): NamedPart {
  const sourceAnchors = entry.metadata?.anchors;
  const anchors = Array.isArray(sourceAnchors)
    ? sourceAnchors.map((sourceAnchor) => {
        if (!sourceAnchor || typeof sourceAnchor !== "object") return sourceAnchor;
        const anchor = sourceAnchor as { position?: unknown };
        if (!Array.isArray(anchor.position) || anchor.position.length < 3) return sourceAnchor;
        const [x, y, z] = anchor.position;
        if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return sourceAnchor;
        const rotated = rotatePointY([x, y, z], placement.rotationY);
        return { ...sourceAnchor, position: [rotated[0] + placement.x, rotated[1] + placement.y, rotated[2] + placement.z] };
      })
    : sourceAnchors;
  return {
    ...entry,
    name: `${suiteKind}_${placement.id}_${entry.name}`,
    label: `${placement.label} · ${entry.label ?? entry.name}`,
    mesh: moved(entry.mesh, placement.x, placement.y, placement.z, 0, placement.rotationY),
    metadata: {
      ...entry.metadata,
      anchors,
      assembly: `bathroom-suite-${suiteKind}`,
      assemblyRole: placement.label,
      layoutIssues: issues,
    },
  };
}

function roomParts(params: BathroomSuiteParams, issues: BathroomLayoutIssue[]): NamedPart[] {
  const wallThickness = 0.12;
  const floorThickness = 0.08;
  const drainSize = 0.16;
  const drainX = 0;
  const drainZ = params.depth * 0.08;
  const metadata = {
    assembly: `bathroom-suite-${params.kind}`,
    assemblyRole: "卫浴空间",
    layoutIssues: issues,
    anchors: [
      { type: "floor", position: [0, 0, 0] },
      { type: "drain", position: [drainX, 0, drainZ] },
      { type: "wall", position: [0, params.height * 0.5, -params.depth * 0.5] },
    ],
  };
  const floorTiles = slabAroundOpening(params.width, params.depth, floorThickness, drainSize, drainSize, drainX, drainZ, -floorThickness * 0.5);
  return [
    part("bathroom_floor", "防滑地面与真实地漏开孔", floorTiles, FLOOR, "floor", "stone", metadata),
    part("bathroom_floor_drain", "公共地漏", moved(box(drainSize * 0.84, floorThickness * 0.18, drainSize * 0.84), drainX, -floorThickness * 0.08, drainZ), DARK_METAL, "drain", "metal", metadata),
    part("bathroom_walls", "卫浴湿区墙面", [
      moved(box(params.width, params.height, wallThickness), 0, params.height * 0.5, -params.depth * 0.5),
      moved(box(wallThickness, params.height, params.depth), -params.width * 0.5, params.height * 0.5, 0),
      moved(box(wallThickness, params.height, params.depth), params.width * 0.5, params.height * 0.5, 0),
    ], WALL, "wall", "stone", metadata),
    ...(params.detail >= 0.5 ? [
      part("bathroom_pipe_routes", "冷热水与排水主干", [
        pipe([[-params.width * 0.42, 0.18, -params.depth * 0.5 + wallThickness], [-params.width * 0.1, 0.18, -params.depth * 0.5 + wallThickness], [-params.width * 0.1, 0.48, -params.depth * 0.5 + wallThickness]], 0.018, params.detail),
        pipe([[params.width * 0.42, 0.18, -params.depth * 0.5 + wallThickness], [params.width * 0.1, 0.18, -params.depth * 0.5 + wallThickness], [params.width * 0.1, 0.48, -params.depth * 0.5 + wallThickness]], 0.018, params.detail),
      ], WATER_PIPE, "plumbing", "pipe", { ...metadata, channels: ["hot-water", "cold-water"] }),
      part("bathroom_hot_marker", "热水管标识", moved(cylinder(0.025, 0.08, 12), -params.width * 0.1, 0.48, -params.depth * 0.5 + wallThickness), HOT_PIPE, "hot-water", "metal", metadata),
      part("bathroom_cold_marker", "冷水管标识", moved(cylinder(0.025, 0.08, 12), params.width * 0.1, 0.48, -params.depth * 0.5 + wallThickness), COLD_PIPE, "cold-water", "metal", metadata),
    ] : []),
  ];
}

export function buildBathroomSuiteParts(input: Partial<BathroomSuiteParams> = {}): NamedPart[] {
  const params = resolveSuiteParams(input);
  const placements = suitePlacements(params);
  const issues = analyzeBathroomLayout(params);
  const fixtureParts = placements.flatMap((placement) => buildBathroomFixtureParts(placement.params)
    .map((entry) => placeFixturePart(entry, placement, params.kind, issues)));
  return [...roomParts(params, issues), ...fixtureParts];
}
