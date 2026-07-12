import {
  box,
  cylinder,
  merge,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type ArticulatedFurnitureKind =
  | "hinged-cabinet"
  | "drawer-chest"
  | "folding-table"
  | "sliding-wardrobe";

export type FurnitureJointType = "hinge" | "slider";

export interface ArticulatedFurnitureParams {
  kind: ArticulatedFurnitureKind;
  width: number;
  height: number;
  depth: number;
  count: number;
  openness: number;
  detail: number;
}

export interface ArticulatedFurnitureDefinition {
  id: string;
  name: string;
  kind: ArticulatedFurnitureKind;
  countLabel: string;
  defaults: ArticulatedFurnitureParams;
}

export interface FurnitureJoint {
  id: string;
  type: FurnitureJointType;
  drivenPart: string;
  pivot: [number, number, number];
  axis: [number, number, number];
  minimum: number;
  maximum: number;
  value: number;
}

export interface ArticulatedFurnitureResult {
  parts: NamedPart[];
  joints: FurnitureJoint[];
}

const WOOD: RGB = [0.47, 0.28, 0.13];
const LIGHT_WOOD: RGB = [0.7, 0.49, 0.27];
const DARK_WOOD: RGB = [0.24, 0.13, 0.06];
const PAINT: RGB = [0.82, 0.81, 0.76];
const METAL: RGB = [0.2, 0.23, 0.25];
const GLASS: RGB = [0.28, 0.58, 0.68];

function definition(
  kind: ArticulatedFurnitureKind,
  name: string,
  countLabel: string,
  width: number,
  height: number,
  depth: number,
  count: number,
): ArticulatedFurnitureDefinition {
  return {
    id: `articulated-${kind}`,
    name,
    kind,
    countLabel,
    defaults: { kind, width, height, depth, count, openness: 0.35, detail: 1 },
  };
}

export const ARTICULATED_FURNITURE_MODELS: ArticulatedFurnitureDefinition[] = [
  definition("hinged-cabinet", "联动铰链柜", "柜门数量", 1.6, 2.1, 0.58, 2),
  definition("drawer-chest", "全行程抽屉柜", "抽屉数量", 0.95, 1.15, 0.52, 4),
  definition("folding-table", "壁挂折叠桌", "支撑臂数量", 1.45, 0.82, 0.78, 2),
  definition("sliding-wardrobe", "多轨推拉衣柜", "滑门数量", 2.4, 2.25, 0.68, 3),
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveParams(input: Partial<ArticulatedFurnitureParams>): ArticulatedFurnitureParams {
  const kind = input.kind ?? "hinged-cabinet";
  const definitionForKind = ARTICULATED_FURNITURE_MODELS.find((entry) => entry.kind === kind)
    ?? ARTICULATED_FURNITURE_MODELS[0]!;
  const defaults = definitionForKind.defaults;
  return {
    kind,
    width: Math.max(0.55, input.width ?? defaults.width),
    height: Math.max(0.45, input.height ?? defaults.height),
    depth: Math.max(0.25, input.depth ?? defaults.depth),
    count: clamp(Math.round(input.count ?? defaults.count), 1, 8),
    openness: clamp(input.openness ?? defaults.openness, 0, 1),
    detail: clamp(input.detail ?? defaults.detail, 0, 1),
  };
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
  surfaceType: string,
  metadata: Record<string, unknown> = {},
): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "metal" ? 0.28 : 0.62 } },
    metadata: { materialSlot, collision: "box", ...metadata },
  };
}

function hingedMesh(
  mesh: Mesh,
  pivotX: number,
  pivotY: number,
  pivotZ: number,
  localCenterX: number,
  angle: number,
): Mesh {
  const local = translateMesh(mesh, vec3(localCenterX, 0, 0));
  return transform(local, { rotate: vec3(0, angle, 0), translate: vec3(pivotX, pivotY, pivotZ) });
}

function cabinetCarcass(width: number, height: number, depth: number, thickness: number): Mesh[] {
  return [
    moved(box(thickness, height, depth), -width / 2 + thickness / 2, height / 2, 0),
    moved(box(thickness, height, depth), width / 2 - thickness / 2, height / 2, 0),
    moved(box(width - thickness * 2, thickness, depth), 0, thickness / 2, 0),
    moved(box(width - thickness * 2, thickness, depth), 0, height - thickness / 2, 0),
    moved(box(width - thickness * 2, height - thickness * 2, thickness), 0, height / 2, -depth / 2 + thickness / 2),
  ];
}

function buildHingedCabinet(params: ArticulatedFurnitureParams): ArticulatedFurnitureResult {
  const thickness = Math.min(0.055, params.width * 0.035);
  const doorCount = clamp(params.count, 1, 4);
  const doorWidth = (params.width - thickness * 2.4) / doorCount;
  const doorHeight = params.height - thickness * 2.5;
  const frontZ = params.depth / 2 + thickness * 0.35;
  const doors: Mesh[] = [];
  const handles: Mesh[] = [];
  const joints: FurnitureJoint[] = [];
  for (let index = 0; index < doorCount; index++) {
    const bayLeft = -params.width / 2 + thickness * 1.2 + doorWidth * index;
    const hingeOnLeft = index % 2 === 0;
    const pivotX = hingeOnLeft ? bayLeft : bayLeft + doorWidth;
    const direction = hingeOnLeft ? 1 : -1;
    const angle = direction * params.openness * Math.PI * 0.52;
    doors.push(hingedMesh(box(doorWidth * 0.96, doorHeight, thickness * 0.72), pivotX, params.height / 2, frontZ, direction * doorWidth * 0.48, angle));
    handles.push(hingedMesh(
      moved(cylinder(thickness * 0.12, doorHeight * 0.24, 10), direction * doorWidth * 0.34, 0, thickness * 0.9),
      pivotX,
      params.height / 2,
      frontZ,
      direction * doorWidth * 0.48,
      angle,
    ));
    joints.push({
      id: `cabinet-door-${index + 1}`,
      type: "hinge",
      drivenPart: "cabinet_doors",
      pivot: [pivotX, params.height / 2, frontZ],
      axis: [0, 1, 0],
      minimum: Math.min(0, direction * Math.PI * 0.52),
      maximum: Math.max(0, direction * Math.PI * 0.52),
      value: angle,
    });
  }
  const shelves = Array.from({ length: Math.max(2, doorCount + 1) }, (_, index) => moved(
    box(params.width - thickness * 2.4, thickness * 0.72, params.depth - thickness * 2),
    0,
    params.height * (index + 1) / (Math.max(2, doorCount + 1) + 1),
    -thickness * 0.25,
  ));
  return {
    parts: [
      part("cabinet_carcass", "柜体框架", cabinetCarcass(params.width, params.height, params.depth, thickness), WOOD, "carcass", "wood"),
      part("cabinet_shelves", "可调层板", shelves, LIGHT_WOOD, "shelves", "wood"),
      part("cabinet_doors", "铰链柜门", doors, PAINT, "doors", "wood", { joints }),
      part("cabinet_handles", "随门执手", handles, METAL, "hardware", "metal", { drivenBy: joints.map((joint) => joint.id) }),
    ],
    joints,
  };
}

function buildDrawerChest(params: ArticulatedFurnitureParams): ArticulatedFurnitureResult {
  const thickness = Math.min(0.05, params.width * 0.045);
  const drawerCount = clamp(params.count, 2, 8);
  const insideHeight = params.height - thickness * 2.4;
  const drawerHeight = insideHeight / drawerCount;
  const travel = Math.min(params.depth * 0.72, 0.58) * params.openness;
  const trays: Mesh[] = [];
  const fronts: Mesh[] = [];
  const handles: Mesh[] = [];
  const joints: FurnitureJoint[] = [];
  for (let index = 0; index < drawerCount; index++) {
    const centerY = thickness * 1.2 + drawerHeight * (index + 0.5);
    const centerZ = travel * (0.72 + index * 0.28 / Math.max(1, drawerCount - 1));
    const drawerTravel = centerZ;
    trays.push(
      moved(box(params.width - thickness * 2.8, thickness * 0.55, params.depth - thickness * 2.8), 0, centerY - drawerHeight * 0.38, centerZ),
      moved(box(thickness * 0.55, drawerHeight * 0.72, params.depth - thickness * 2.8), -params.width / 2 + thickness * 1.65, centerY, centerZ),
      moved(box(thickness * 0.55, drawerHeight * 0.72, params.depth - thickness * 2.8), params.width / 2 - thickness * 1.65, centerY, centerZ),
    );
    const frontZ = params.depth / 2 + thickness * 0.42 + drawerTravel;
    fronts.push(moved(box(params.width - thickness * 2.25, drawerHeight * 0.88, thickness * 0.75), 0, centerY, frontZ));
    handles.push(moved(cylinder(thickness * 0.12, params.width * 0.28, 10), 0, centerY, frontZ + thickness * 0.62, 0, 0, Math.PI / 2));
    joints.push({
      id: `drawer-${index + 1}`,
      type: "slider",
      drivenPart: "drawer_trays",
      pivot: [0, centerY, params.depth / 2],
      axis: [0, 0, 1],
      minimum: 0,
      maximum: Math.min(params.depth * 0.72, 0.58),
      value: drawerTravel,
    });
  }
  return {
    parts: [
      part("drawer_carcass", "抽屉柜框架", cabinetCarcass(params.width, params.height, params.depth, thickness), DARK_WOOD, "carcass", "wood"),
      part("drawer_trays", "抽屉盒体", trays, WOOD, "drawers", "wood", { joints }),
      part("drawer_fronts", "抽屉面板", fronts, LIGHT_WOOD, "fronts", "wood", { drivenBy: joints.map((joint) => joint.id) }),
      part("drawer_handles", "抽屉拉手", handles, METAL, "hardware", "metal", { drivenBy: joints.map((joint) => joint.id) }),
    ],
    joints,
  };
}

function buildFoldingTable(params: ArticulatedFurnitureParams): ArticulatedFurnitureResult {
  const thickness = Math.min(0.055, params.height * 0.065);
  const angle = (1 - params.openness) * Math.PI / 2;
  const tabletopLocal = translateMesh(box(params.width, thickness, params.depth), vec3(0, 0, params.depth / 2));
  const tabletop = transform(tabletopLocal, {
    rotate: vec3(angle, 0, 0),
    translate: vec3(0, params.height, 0),
  });
  const supportCount = clamp(params.count, 2, 4);
  const supportArms: Mesh[] = [];
  for (let index = 0; index < supportCount; index++) {
    const x = supportCount === 1 ? 0 : -params.width * 0.38 + params.width * 0.76 * index / (supportCount - 1);
    const armLength = Math.hypot(params.depth * 0.72, params.height * 0.62);
    const armAngle = Math.atan2(params.height * 0.62, params.depth * 0.72) * params.openness;
    supportArms.push(moved(box(thickness * 0.7, thickness * 0.7, armLength), x, params.height * 0.68, params.depth * 0.28, -armAngle));
  }
  const joints: FurnitureJoint[] = [{
    id: "tabletop-hinge",
    type: "hinge",
    drivenPart: "folding_tabletop",
    pivot: [0, params.height, 0],
    axis: [1, 0, 0],
    minimum: 0,
    maximum: Math.PI / 2,
    value: angle,
  }];
  return {
    parts: [
      part("wall_mount", "墙面安装板", moved(box(params.width * 0.86, params.height * 0.42, thickness), 0, params.height * 0.72, -thickness / 2), DARK_WOOD, "mount", "wood"),
      part("folding_tabletop", "折叠桌面", tabletop, LIGHT_WOOD, "tabletop", "wood", { joints }),
      part("folding_supports", "联动支撑臂", supportArms, METAL, "supports", "metal", { openness: params.openness }),
      ...(params.detail >= 0.5 ? [part("hinge_barrel", "连续铰链", moved(cylinder(thickness * 0.22, params.width * 0.9, 12), 0, params.height, 0, 0, 0, Math.PI / 2), METAL, "hardware", "metal")] : []),
    ],
    joints,
  };
}

function buildSlidingWardrobe(params: ArticulatedFurnitureParams): ArticulatedFurnitureResult {
  const thickness = Math.min(0.055, params.width * 0.025);
  const panelCount = clamp(params.count, 2, 4);
  const panelWidth = (params.width - thickness * 2.4) / panelCount;
  const panelHeight = params.height - thickness * 2.6;
  const panels: Mesh[] = [];
  const glassPanels: Mesh[] = [];
  const handles: Mesh[] = [];
  const joints: FurnitureJoint[] = [];
  for (let index = 0; index < panelCount; index++) {
    const closedX = -params.width / 2 + thickness * 1.2 + panelWidth * (index + 0.5);
    const direction = index < panelCount / 2 ? 1 : -1;
    const travel = direction * panelWidth * 0.82 * params.openness;
    const trackZ = params.depth / 2 + thickness * (0.28 + (index % 2) * 0.78);
    panels.push(moved(box(panelWidth * 0.97, panelHeight, thickness * 0.62), closedX + travel, params.height / 2, trackZ));
    glassPanels.push(moved(box(panelWidth * 0.72, panelHeight * 0.8, thickness * 0.18), closedX + travel, params.height / 2, trackZ + thickness * 0.43));
    handles.push(moved(cylinder(thickness * 0.12, panelHeight * 0.26, 10), closedX + travel - direction * panelWidth * 0.32, params.height / 2, trackZ + thickness * 0.58));
    joints.push({
      id: `sliding-panel-${index + 1}`,
      type: "slider",
      drivenPart: "sliding_panels",
      pivot: [closedX, params.height / 2, trackZ],
      axis: [direction, 0, 0],
      minimum: 0,
      maximum: panelWidth * 0.82,
      value: Math.abs(travel),
    });
  }
  const tracks = [
    moved(box(params.width - thickness * 2.4, thickness * 0.35, thickness * 1.9), 0, thickness * 1.7, params.depth / 2 + thickness * 0.55),
    moved(box(params.width - thickness * 2.4, thickness * 0.35, thickness * 1.9), 0, params.height - thickness * 1.7, params.depth / 2 + thickness * 0.55),
  ];
  return {
    parts: [
      part("wardrobe_carcass", "衣柜框架", cabinetCarcass(params.width, params.height, params.depth, thickness), WOOD, "carcass", "wood"),
      part("sliding_tracks", "双层滑轨", tracks, METAL, "tracks", "metal"),
      part("sliding_panels", "推拉门板", panels, PAINT, "doors", "wood", { joints }),
      part("sliding_handles", "随门拉手", handles, METAL, "hardware", "metal", { drivenBy: joints.map((joint) => joint.id) }),
      ...(params.detail >= 0.5 ? [part("wardrobe_glass", "门板装饰玻璃", glassPanels, GLASS, "door-glass", "glass", { drivenBy: joints.map((joint) => joint.id) })] : []),
    ],
    joints,
  };
}

export function buildArticulatedFurniture(input: Partial<ArticulatedFurnitureParams> = {}): ArticulatedFurnitureResult {
  const params = resolveParams(input);
  let result: ArticulatedFurnitureResult;
  if (params.kind === "drawer-chest") result = buildDrawerChest(params);
  else if (params.kind === "folding-table") result = buildFoldingTable(params);
  else if (params.kind === "sliding-wardrobe") result = buildSlidingWardrobe(params);
  else result = buildHingedCabinet(params);
  return {
    joints: result.joints,
    parts: result.parts.map((entry) => ({
      ...entry,
      metadata: {
        ...entry.metadata,
        proceduralFamily: "articulated-furniture-system",
        furnitureKind: params.kind,
        jointState: result.joints,
      },
    })),
  };
}

export function buildArticulatedFurnitureParts(input: Partial<ArticulatedFurnitureParams> = {}): NamedPart[] {
  return buildArticulatedFurniture(input).parts;
}
