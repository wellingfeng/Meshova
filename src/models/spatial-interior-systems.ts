import {
  box,
  merge,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export type RoomWallSide = "front" | "back" | "left" | "right";
export type RoomOpeningKind = "door" | "window";

export interface RoomOpening {
  id: string;
  kind: RoomOpeningKind;
  wall: RoomWallSide;
  center: number;
  width: number;
  height: number;
  sill: number;
  openness: number;
}

export interface RoomShellParams {
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  floorThickness: number;
  frontWall: boolean;
  ceiling: boolean;
  baseboards: boolean;
  detail: number;
}

export type RoomShellPresetKind =
  | "entry-window-room"
  | "dual-aspect-room"
  | "corner-window-room";

export interface RoomShellPresetParams extends RoomShellParams {
  kind: RoomShellPresetKind;
  doorWidth: number;
  windowWidth: number;
  openness: number;
}

export interface RoomShellDefinition {
  id: string;
  name: string;
  kind: RoomShellPresetKind;
  defaults: RoomShellPresetParams;
}

export type StorageWallKind = "wardrobe-wall" | "bookcase-wall" | "media-wall";

export interface StorageWallParams {
  kind: StorageWallKind;
  width: number;
  height: number;
  depth: number;
  bays: number;
  shelves: number;
  drawers: number;
  openness: number;
  detail: number;
}

export interface StorageWallDefinition {
  id: string;
  name: string;
  kind: StorageWallKind;
  defaults: StorageWallParams;
}

export interface StorageRoomSuiteParams {
  width: number;
  depth: number;
  height: number;
  bays: number;
  shelves: number;
  openness: number;
  detail: number;
}

const WALL: RGB = [0.78, 0.76, 0.7];
const WALL_EDGE: RGB = [0.91, 0.89, 0.84];
const FLOOR: RGB = [0.52, 0.34, 0.18];
const WOOD: RGB = [0.46, 0.27, 0.12];
const LIGHT_WOOD: RGB = [0.72, 0.53, 0.31];
const DARK_WOOD: RGB = [0.22, 0.12, 0.055];
const PAINT: RGB = [0.87, 0.86, 0.82];
const METAL: RGB = [0.18, 0.2, 0.22];
const GLASS: RGB = [0.39, 0.66, 0.76];
const SCREEN: RGB = [0.025, 0.035, 0.045];
const BOOKS: RGB = [0.5, 0.18, 0.13];

export const ROOM_SHELL_DEFAULTS: RoomShellParams = {
  width: 6.4,
  depth: 4.8,
  height: 2.9,
  wallThickness: 0.16,
  floorThickness: 0.12,
  frontWall: false,
  ceiling: false,
  baseboards: true,
  detail: 1,
};

function roomDefinition(
  kind: RoomShellPresetKind,
  name: string,
  width: number,
  depth: number,
): RoomShellDefinition {
  return {
    id: `spatial-${kind}`,
    name,
    kind,
    defaults: {
      ...ROOM_SHELL_DEFAULTS,
      kind,
      width,
      depth,
      doorWidth: 0.95,
      windowWidth: 1.65,
      openness: 0.25,
    },
  };
}

export const ROOM_SHELL_MODELS: RoomShellDefinition[] = [
  roomDefinition("entry-window-room", "入户门窗房间壳体", 6.4, 4.8),
  roomDefinition("dual-aspect-room", "双向采光房间壳体", 7.2, 5.2),
  roomDefinition("corner-window-room", "转角采光房间壳体", 6.8, 5.6),
];

function storageDefinition(
  kind: StorageWallKind,
  name: string,
  width: number,
  height: number,
  depth: number,
  bays: number,
  shelves: number,
  drawers: number,
): StorageWallDefinition {
  return {
    id: `spatial-${kind}`,
    name,
    kind,
    defaults: { kind, width, height, depth, bays, shelves, drawers, openness: 0, detail: 1 },
  };
}

export const STORAGE_WALL_MODELS: StorageWallDefinition[] = [
  storageDefinition("wardrobe-wall", "模块化整墙衣柜", 3.6, 2.55, 0.62, 4, 3, 2),
  storageDefinition("bookcase-wall", "模块化整墙书柜", 3.2, 2.45, 0.38, 4, 5, 1),
  storageDefinition("media-wall", "模块化电视收纳墙", 4.2, 2.5, 0.42, 5, 4, 2),
];

export const STORAGE_ROOM_SUITE_DEFAULTS: StorageRoomSuiteParams = {
  width: 7.2,
  depth: 5.4,
  height: 2.9,
  bays: 5,
  shelves: 4,
  openness: 0.2,
  detail: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moved(
  mesh: Mesh,
  centerX: number,
  centerY: number,
  centerZ: number,
  rotateY = 0,
): Mesh {
  return transform(mesh, { translate: vec3(centerX, centerY, centerZ), rotate: vec3(0, rotateY, 0) });
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
  const meshList = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: meshList.length === 1 ? meshList[0]! : merge(...meshList),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "metal" ? 0.32 : 0.72 } },
    metadata: { materialSlot, collision: "box", deterministic: true, ...metadata },
  };
}

function normalizeRoomParams(input: Partial<RoomShellParams>): RoomShellParams {
  const width = clamp(input.width ?? ROOM_SHELL_DEFAULTS.width, 2.4, 20);
  const depth = clamp(input.depth ?? ROOM_SHELL_DEFAULTS.depth, 2.4, 20);
  const height = clamp(input.height ?? ROOM_SHELL_DEFAULTS.height, 2, 8);
  return {
    width,
    depth,
    height,
    wallThickness: clamp(input.wallThickness ?? ROOM_SHELL_DEFAULTS.wallThickness, 0.06, Math.min(width, depth) * 0.12),
    floorThickness: clamp(input.floorThickness ?? ROOM_SHELL_DEFAULTS.floorThickness, 0.04, 0.5),
    frontWall: input.frontWall ?? ROOM_SHELL_DEFAULTS.frontWall,
    ceiling: input.ceiling ?? ROOM_SHELL_DEFAULTS.ceiling,
    baseboards: input.baseboards ?? ROOM_SHELL_DEFAULTS.baseboards,
    detail: clamp(input.detail ?? ROOM_SHELL_DEFAULTS.detail, 0, 1),
  };
}

function wallLength(side: RoomWallSide, params: RoomShellParams): number {
  return side === "front" || side === "back" ? params.width : params.depth;
}

function normalizeOpenings(
  openings: readonly RoomOpening[],
  params: RoomShellParams,
): RoomOpening[] {
  return openings.map((opening, index) => {
    const length = wallLength(opening.wall, params);
    const kind = opening.kind;
    const width = clamp(opening.width, 0.35, Math.max(0.35, length - params.wallThickness * 3));
    const sill = kind === "door" ? 0 : clamp(opening.sill, 0.25, params.height - 0.5);
    const height = clamp(opening.height, 0.35, params.height - sill - 0.08);
    const centerLimit = Math.max(0, length * 0.5 - width * 0.5 - params.wallThickness);
    return {
      id: opening.id || `opening-${index}`,
      kind,
      wall: opening.wall,
      center: clamp(opening.center, -centerLimit, centerLimit),
      width,
      height,
      sill,
      openness: clamp(opening.openness, 0, 1),
    };
  });
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1e6) / 1e6))].sort((left, right) => left - right);
}

function placeOnWall(
  mesh: Mesh,
  side: RoomWallSide,
  horizontal: number,
  centerY: number,
  params: RoomShellParams,
  depthOffset = 0,
): Mesh {
  if (side === "back") return moved(mesh, horizontal, centerY, -params.depth * 0.5 + depthOffset);
  if (side === "front") return moved(mesh, horizontal, centerY, params.depth * 0.5 - depthOffset, Math.PI);
  if (side === "left") return moved(mesh, -params.width * 0.5 + depthOffset, centerY, horizontal, Math.PI * 0.5);
  return moved(mesh, params.width * 0.5 - depthOffset, centerY, horizontal, -Math.PI * 0.5);
}

function wallSegments(
  side: RoomWallSide,
  params: RoomShellParams,
  openings: readonly RoomOpening[],
): Mesh[] {
  const length = wallLength(side, params);
  const relevant = openings.filter((opening) => opening.wall === side);
  const horizontalBounds = uniqueSorted([
    -length * 0.5,
    length * 0.5,
    ...relevant.flatMap((opening) => [opening.center - opening.width * 0.5, opening.center + opening.width * 0.5]),
  ]);
  const verticalBounds = uniqueSorted([
    0,
    params.height,
    ...relevant.flatMap((opening) => [opening.sill, opening.sill + opening.height]),
  ]);
  const segments: Mesh[] = [];
  for (let horizontalIndex = 0; horizontalIndex < horizontalBounds.length - 1; horizontalIndex++) {
    const start = horizontalBounds[horizontalIndex]!;
    const end = horizontalBounds[horizontalIndex + 1]!;
    const center = (start + end) * 0.5;
    for (let verticalIndex = 0; verticalIndex < verticalBounds.length - 1; verticalIndex++) {
      const bottom = verticalBounds[verticalIndex]!;
      const top = verticalBounds[verticalIndex + 1]!;
      const centerY = (bottom + top) * 0.5;
      const insideOpening = relevant.some((opening) => (
        center > opening.center - opening.width * 0.5 + 1e-6
        && center < opening.center + opening.width * 0.5 - 1e-6
        && centerY > opening.sill + 1e-6
        && centerY < opening.sill + opening.height - 1e-6
      ));
      if (insideOpening || end - start < 1e-5 || top - bottom < 1e-5) continue;
      const segment = box(end - start, top - bottom, params.wallThickness);
      segments.push(placeOnWall(segment, side, center, centerY, params));
    }
  }
  return segments;
}

function openingGeometry(
  opening: RoomOpening,
  params: RoomShellParams,
): { frames: Mesh[]; glazing: Mesh[]; leaves: Mesh[]; hardware: Mesh[] } {
  const frames: Mesh[] = [];
  const glazing: Mesh[] = [];
  const leaves: Mesh[] = [];
  const hardware: Mesh[] = [];
  const frameWidth = clamp(Math.min(opening.width, opening.height) * 0.055, 0.045, 0.11);
  const frameDepth = params.wallThickness * 1.18;
  const localFrameMeshes = [
    moved(box(frameWidth, opening.height, frameDepth), -opening.width * 0.5, opening.height * 0.5, 0),
    moved(box(frameWidth, opening.height, frameDepth), opening.width * 0.5, opening.height * 0.5, 0),
    moved(box(opening.width + frameWidth, frameWidth, frameDepth), 0, opening.height, 0),
  ];
  if (opening.kind === "window") {
    localFrameMeshes.push(moved(box(opening.width + frameWidth, frameWidth, frameDepth), 0, 0, 0));
  }
  for (const frameMesh of localFrameMeshes) {
    frames.push(placeOnWall(frameMesh, opening.wall, opening.center, opening.sill, params));
  }

  if (opening.kind === "window") {
    const glass = moved(box(opening.width - frameWidth * 1.4, opening.height - frameWidth * 1.4, 0.025), 0, opening.height * 0.5, 0);
    glazing.push(placeOnWall(glass, opening.wall, opening.center, opening.sill, params, -params.wallThickness * 0.02));
    const mullion = moved(box(frameWidth * 0.62, opening.height - frameWidth, frameDepth * 0.7), 0, opening.height * 0.5, 0);
    frames.push(placeOnWall(mullion, opening.wall, opening.center, opening.sill, params));
    const sill = moved(box(opening.width + frameWidth * 2, frameWidth * 0.72, params.wallThickness * 1.9), 0, 0, 0);
    frames.push(placeOnWall(sill, opening.wall, opening.center, opening.sill, params, -params.wallThickness * 0.15));
  } else {
    const hingeX = -opening.width * 0.5 + frameWidth * 0.5;
    const angle = -opening.openness * Math.PI * 0.5;
    const localLeaf = moved(
      box(opening.width - frameWidth, opening.height - frameWidth, params.wallThickness * 0.42),
      (opening.width - frameWidth) * 0.5,
      opening.height * 0.5,
      0,
    );
    const hingedLeaf = moved(localLeaf, hingeX, 0, 0, angle);
    leaves.push(placeOnWall(hingedLeaf, opening.wall, opening.center, opening.sill, params));
    const handle = moved(box(0.04, 0.16, 0.06), opening.width * 0.3, opening.height * 0.48, params.wallThickness * 0.3);
    hardware.push(placeOnWall(handle, opening.wall, opening.center, opening.sill, params));
  }
  return { frames, glazing, leaves, hardware };
}

function baseboardSegments(
  side: RoomWallSide,
  params: RoomShellParams,
  openings: readonly RoomOpening[],
): Mesh[] {
  const length = wallLength(side, params);
  const doors = openings
    .filter((opening) => opening.wall === side && opening.kind === "door")
    .sort((left, right) => left.center - right.center);
  const intervals: Array<[number, number]> = [];
  let cursor = -length * 0.5;
  for (const door of doors) {
    const start = door.center - door.width * 0.5;
    if (start > cursor) intervals.push([cursor, start]);
    cursor = Math.max(cursor, door.center + door.width * 0.5);
  }
  if (cursor < length * 0.5) intervals.push([cursor, length * 0.5]);
  const boardHeight = Math.min(0.12, params.height * 0.05);
  return intervals
    .filter(([start, end]) => end - start > 0.02)
    .map(([start, end]) => placeOnWall(
      box(end - start, boardHeight, params.wallThickness * 0.28),
      side,
      (start + end) * 0.5,
      boardHeight * 0.5,
      params,
      params.wallThickness * 0.56,
    ));
}

export function buildRoomShellParts(
  input: Partial<RoomShellParams> = {},
  requestedOpenings: readonly RoomOpening[] = [],
): NamedPart[] {
  const params = normalizeRoomParams(input);
  const openings = normalizeOpenings(requestedOpenings, params);
  const sides: RoomWallSide[] = params.frontWall
    ? ["front", "back", "left", "right"]
    : ["back", "left", "right"];
  const walls = sides.flatMap((side) => wallSegments(side, params, openings));
  const frameMeshes: Mesh[] = [];
  const glazingMeshes: Mesh[] = [];
  const leafMeshes: Mesh[] = [];
  const hardwareMeshes: Mesh[] = [];
  for (const opening of openings) {
    const geometry = openingGeometry(opening, params);
    frameMeshes.push(...geometry.frames);
    glazingMeshes.push(...geometry.glazing);
    leafMeshes.push(...geometry.leaves);
    hardwareMeshes.push(...geometry.hardware);
  }
  const anchors = [
    { type: "floor", position: [0, 0, 0] },
    { type: "ceiling", position: [0, params.height, 0] },
    { type: "back-wall", position: [0, params.height * 0.5, -params.depth * 0.5] },
    { type: "left-wall", position: [-params.width * 0.5, params.height * 0.5, 0] },
    { type: "right-wall", position: [params.width * 0.5, params.height * 0.5, 0] },
    ...openings.map((opening) => ({
      type: `${opening.kind}-opening`,
      id: opening.id,
      wall: opening.wall,
      position: [opening.center, opening.sill, opening.sill + opening.height],
    })),
  ];
  const metadata = { anchors, openings, system: "room-shell", lod: params.detail >= 0.5 ? "high" : "preview" };
  const parts: NamedPart[] = [
    part("room_walls", "带真实洞口墙体", walls, WALL, "walls", "plaster", metadata),
    part("room_floor", "室内地面", moved(box(params.width, params.floorThickness, params.depth), 0, -params.floorThickness * 0.5, 0), FLOOR, "floor", "wood", metadata),
  ];
  if (params.ceiling) {
    parts.push(part("room_ceiling", "房间吊顶", moved(box(params.width, params.floorThickness, params.depth), 0, params.height + params.floorThickness * 0.5, 0), WALL_EDGE, "ceiling", "plaster", metadata));
  }
  if (frameMeshes.length) parts.push(part("opening_frames", "门窗洞口套框", frameMeshes, WALL_EDGE, "opening-frame", "wood", metadata));
  if (glazingMeshes.length) parts.push(part("window_glazing", "窗户玻璃", glazingMeshes, GLASS, "glass", "glass", metadata));
  if (leafMeshes.length) parts.push(part("door_leaves", "可开启门扇", leafMeshes, DARK_WOOD, "door-leaf", "wood", metadata));
  if (hardwareMeshes.length) parts.push(part("door_hardware", "门锁五金", hardwareMeshes, METAL, "hardware", "metal", metadata));
  if (params.baseboards && params.detail >= 0.5) {
    const boards = sides.flatMap((side) => baseboardSegments(side, params, openings));
    if (boards.length) parts.push(part("room_baseboards", "避让门洞踢脚线", boards, LIGHT_WOOD, "trim", "wood", metadata));
  }
  return parts;
}

function normalizePresetParams(input: Partial<RoomShellPresetParams>): RoomShellPresetParams {
  const kind = input.kind ?? "entry-window-room";
  const definition = ROOM_SHELL_MODELS.find((entry) => entry.kind === kind) ?? ROOM_SHELL_MODELS[0]!;
  const room = normalizeRoomParams({ ...definition.defaults, ...input });
  return {
    ...room,
    kind,
    doorWidth: clamp(input.doorWidth ?? definition.defaults.doorWidth, 0.7, Math.max(0.7, room.width * 0.32)),
    windowWidth: clamp(input.windowWidth ?? definition.defaults.windowWidth, 0.65, Math.max(0.65, Math.min(room.width, room.depth) * 0.48)),
    openness: clamp(input.openness ?? definition.defaults.openness, 0, 1),
  };
}

export function buildRoomShellPresetParts(input: Partial<RoomShellPresetParams> = {}): NamedPart[] {
  const params = normalizePresetParams(input);
  const openings: RoomOpening[] = [
    {
      id: "entry-door",
      kind: "door",
      wall: "back",
      center: -params.width * 0.28,
      width: params.doorWidth,
      height: Math.min(2.2, params.height - 0.12),
      sill: 0,
      openness: params.openness,
    },
    {
      id: "main-window",
      kind: "window",
      wall: "back",
      center: params.width * 0.22,
      width: params.windowWidth,
      height: Math.min(1.35, params.height * 0.5),
      sill: Math.min(0.95, params.height * 0.32),
      openness: 0,
    },
  ];
  if (params.kind === "dual-aspect-room") {
    openings.push({
      id: "side-window",
      kind: "window",
      wall: "right",
      center: -params.depth * 0.08,
      width: params.windowWidth * 0.88,
      height: Math.min(1.3, params.height * 0.48),
      sill: Math.min(0.92, params.height * 0.31),
      openness: 0,
    });
  } else if (params.kind === "corner-window-room") {
    openings.push({
      id: "corner-window",
      kind: "window",
      wall: "left",
      center: -params.depth * 0.18,
      width: params.windowWidth * 1.12,
      height: Math.min(1.55, params.height * 0.56),
      sill: Math.min(0.72, params.height * 0.25),
      openness: 0,
    });
  }
  return buildRoomShellParts(params, openings).map((entry) => ({
    ...entry,
    metadata: { ...entry.metadata, preset: params.kind },
  }));
}

function normalizeStorageParams(input: Partial<StorageWallParams>): StorageWallParams {
  const kind = input.kind ?? "wardrobe-wall";
  const definition = STORAGE_WALL_MODELS.find((entry) => entry.kind === kind) ?? STORAGE_WALL_MODELS[0]!;
  return {
    kind,
    width: clamp(input.width ?? definition.defaults.width, 1.2, 12),
    height: clamp(input.height ?? definition.defaults.height, 1.2, 4.5),
    depth: clamp(input.depth ?? definition.defaults.depth, 0.22, 1.2),
    bays: clamp(Math.round(input.bays ?? definition.defaults.bays), 2, 12),
    shelves: clamp(Math.round(input.shelves ?? definition.defaults.shelves), 1, 10),
    drawers: clamp(Math.round(input.drawers ?? definition.defaults.drawers), 0, 6),
    openness: clamp(input.openness ?? definition.defaults.openness, 0, 1),
    detail: clamp(input.detail ?? definition.defaults.detail, 0, 1),
  };
}

function hingedPanel(
  width: number,
  height: number,
  depth: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  openness: number,
  hingeRight: boolean,
): Mesh {
  const direction = hingeRight ? -1 : 1;
  const hingeX = centerX + direction * width * 0.5;
  const localCenter = -direction * width * 0.5;
  const localPanel = moved(box(width, height, depth), localCenter, centerY, 0);
  return moved(localPanel, hingeX, 0, centerZ, direction * openness * Math.PI * 0.48);
}

export function buildStorageWallParts(input: Partial<StorageWallParams> = {}): NamedPart[] {
  const params = normalizeStorageParams(input);
  const thickness = clamp(Math.min(params.width / params.bays, params.height) * 0.045, 0.035, 0.075);
  const bayWidth = (params.width - thickness * 2) / params.bays;
  const insideHeight = params.height - thickness * 2;
  const shell = [
    moved(box(params.width, thickness, params.depth), 0, thickness * 0.5, 0),
    moved(box(params.width, thickness, params.depth), 0, params.height - thickness * 0.5, 0),
    moved(box(thickness, params.height, params.depth), -params.width * 0.5 + thickness * 0.5, params.height * 0.5, 0),
    moved(box(thickness, params.height, params.depth), params.width * 0.5 - thickness * 0.5, params.height * 0.5, 0),
    moved(box(params.width, params.height, thickness), 0, params.height * 0.5, -params.depth * 0.5 + thickness * 0.5),
  ];
  const dividers = Array.from({ length: params.bays - 1 }, (_, index) => moved(
    box(thickness, insideHeight, params.depth - thickness),
    -params.width * 0.5 + thickness + bayWidth * (index + 1),
    params.height * 0.5,
    thickness * 0.5,
  ));
  const shelfMeshes: Mesh[] = [];
  const doorMeshes: Mesh[] = [];
  const drawerMeshes: Mesh[] = [];
  const handleMeshes: Mesh[] = [];
  const propMeshes: Mesh[] = [];
  const drawerZone = params.drawers > 0 ? Math.min(0.72, insideHeight * 0.32) : 0;
  const shelfZoneHeight = insideHeight - drawerZone;
  const frontZ = params.depth * 0.5 + thickness * 0.08;

  for (let bayIndex = 0; bayIndex < params.bays; bayIndex++) {
    const centerX = -params.width * 0.5 + thickness + bayWidth * (bayIndex + 0.5);
    const isMediaCenter = params.kind === "media-wall" && Math.abs(bayIndex - (params.bays - 1) * 0.5) < 0.75;
    const shelfCount = isMediaCenter ? 1 : params.shelves;
    for (let shelfIndex = 1; shelfIndex <= shelfCount; shelfIndex++) {
      const centerY = thickness + drawerZone + shelfZoneHeight * shelfIndex / (shelfCount + 1);
      shelfMeshes.push(moved(box(bayWidth - thickness * 0.55, thickness, params.depth - thickness * 1.5), centerX, centerY, thickness * 0.25));
    }
    for (let drawerIndex = 0; drawerIndex < params.drawers; drawerIndex++) {
      const drawerHeight = drawerZone / Math.max(1, params.drawers);
      const centerY = thickness + drawerHeight * (drawerIndex + 0.5);
      drawerMeshes.push(moved(
        box(bayWidth - thickness * 0.7, drawerHeight * 0.86, thickness * 0.62),
        centerX,
        centerY,
        frontZ + params.openness * params.depth * 0.38,
      ));
      handleMeshes.push(moved(box(bayWidth * 0.32, thickness * 0.18, thickness * 0.22), centerX, centerY, frontZ + thickness * 0.45 + params.openness * params.depth * 0.38));
    }
    const needsDoor = params.kind === "wardrobe-wall" || (params.kind === "media-wall" && !isMediaCenter);
    if (needsDoor) {
      const doorBottom = thickness + drawerZone;
      const doorHeight = insideHeight - drawerZone;
      doorMeshes.push(hingedPanel(
        bayWidth * 0.94,
        doorHeight * 0.96,
        thickness * 0.55,
        centerX,
        doorBottom + doorHeight * 0.5,
        frontZ,
        params.openness,
        bayIndex % 2 === 1,
      ));
      handleMeshes.push(moved(
        box(thickness * 0.2, Math.min(0.24, doorHeight * 0.28), thickness * 0.24),
        centerX + (bayIndex % 2 === 0 ? bayWidth * 0.32 : -bayWidth * 0.32),
        doorBottom + doorHeight * 0.5,
        frontZ + thickness * 0.45,
      ));
    }
    if (params.kind === "bookcase-wall" && params.detail >= 0.5) {
      for (let shelfIndex = 0; shelfIndex < params.shelves; shelfIndex++) {
        const levelHeight = shelfZoneHeight / (params.shelves + 1);
        const bookCount = 2 + (bayIndex + shelfIndex) % 4;
        for (let bookIndex = 0; bookIndex < bookCount; bookIndex++) {
          const bookWidth = bayWidth * 0.1;
          const centerY = thickness + drawerZone + levelHeight * shelfIndex + levelHeight * 0.38;
          const bookX = centerX - bayWidth * 0.32 + bookWidth * bookIndex * 1.15;
          propMeshes.push(moved(box(bookWidth, levelHeight * (0.52 + ((bookIndex + bayIndex) % 3) * 0.08), params.depth * 0.42), bookX, centerY, frontZ - params.depth * 0.3));
        }
      }
    }
  }

  const anchors = [
    { type: "floor", position: [0, 0, 0] },
    { type: "wall", position: [0, params.height * 0.5, -params.depth * 0.5] },
    { type: "connection-left", position: [-params.width * 0.5, params.height * 0.5, 0] },
    { type: "connection-right", position: [params.width * 0.5, params.height * 0.5, 0] },
    ...Array.from({ length: params.bays }, (_, index) => ({
      type: "storage-bay",
      index,
      position: [-params.width * 0.5 + thickness + bayWidth * (index + 0.5), thickness, frontZ],
    })),
  ];
  const metadata = {
    anchors,
    family: "storage-wall",
    kind: params.kind,
    bays: params.bays,
    shelves: params.shelves,
    drawers: params.drawers,
    lod: params.detail >= 0.5 ? "high" : "preview",
  };
  const parts: NamedPart[] = [
    part("storage_carcass", "收纳墙柜体", shell, WOOD, "carcass", "wood", metadata),
    part("storage_dividers", "自动格口分隔板", dividers, WOOD, "carcass", "wood", metadata),
    part("storage_shelves", "自动分配层板", shelfMeshes, LIGHT_WOOD, "shelves", "wood", metadata),
  ];
  if (doorMeshes.length) parts.push(part("storage_doors", "可开启收纳门板", doorMeshes, PAINT, "fronts", "wood", metadata));
  if (drawerMeshes.length) parts.push(part("storage_drawers", "联动抽屉面板", drawerMeshes, LIGHT_WOOD, "drawers", "wood", metadata));
  if (handleMeshes.length) parts.push(part("storage_hardware", "收纳五金", handleMeshes, METAL, "hardware", "metal", metadata));
  if (propMeshes.length) parts.push(part("storage_props", "程序化书籍陈设", propMeshes, BOOKS, "contents", "plastic", metadata));
  if (params.kind === "media-wall") {
    const screenWidth = bayWidth * Math.min(2.35, params.bays - 1);
    const screenHeight = Math.min(params.height * 0.42, screenWidth * 0.56);
    parts.push(
      part("media_screen", "电视显示屏", moved(box(screenWidth, screenHeight, thickness * 0.42), 0, params.height * 0.58, frontZ + thickness * 0.2), SCREEN, "screen", "plastic", metadata),
      part("media_cable_slot", "隐藏线缆槽", moved(box(thickness * 0.42, params.height * 0.22, thickness * 0.3), 0, params.height * 0.25, frontZ + thickness * 0.18), METAL, "electrical", "metal", metadata),
    );
  }
  return parts;
}

function placeAssemblyPart(
  entry: NamedPart,
  prefix: string,
  labelPrefix: string,
  centerX: number,
  centerY: number,
  centerZ: number,
): NamedPart {
  const sourceAnchors = entry.metadata?.anchors;
  const anchors = Array.isArray(sourceAnchors)
    ? sourceAnchors.map((sourceAnchor) => {
        if (!sourceAnchor || typeof sourceAnchor !== "object") return sourceAnchor;
        const anchor = sourceAnchor as { position?: unknown };
        if (!Array.isArray(anchor.position) || anchor.position.length < 3) return sourceAnchor;
        const [positionX, positionY, positionZ] = anchor.position;
        if (typeof positionX !== "number" || typeof positionY !== "number" || typeof positionZ !== "number") return sourceAnchor;
        return { ...sourceAnchor, position: [positionX + centerX, positionY + centerY, positionZ + centerZ] };
      })
    : sourceAnchors;
  return {
    ...entry,
    name: `${prefix}_${entry.name}`,
    label: `${labelPrefix} · ${entry.label ?? entry.name}`,
    mesh: moved(entry.mesh, centerX, centerY, centerZ),
    metadata: { ...entry.metadata, anchors, assemblyRole: labelPrefix },
  };
}

export function buildStorageRoomSuiteParts(input: Partial<StorageRoomSuiteParams> = {}): NamedPart[] {
  const params: StorageRoomSuiteParams = {
    width: clamp(input.width ?? STORAGE_ROOM_SUITE_DEFAULTS.width, 4.2, 14),
    depth: clamp(input.depth ?? STORAGE_ROOM_SUITE_DEFAULTS.depth, 3.2, 12),
    height: clamp(input.height ?? STORAGE_ROOM_SUITE_DEFAULTS.height, 2.2, 4.5),
    bays: clamp(Math.round(input.bays ?? STORAGE_ROOM_SUITE_DEFAULTS.bays), 3, 10),
    shelves: clamp(Math.round(input.shelves ?? STORAGE_ROOM_SUITE_DEFAULTS.shelves), 2, 8),
    openness: clamp(input.openness ?? STORAGE_ROOM_SUITE_DEFAULTS.openness, 0, 1),
    detail: clamp(input.detail ?? STORAGE_ROOM_SUITE_DEFAULTS.detail, 0, 1),
  };
  const roomParts = buildRoomShellParts({
    width: params.width,
    depth: params.depth,
    height: params.height,
    wallThickness: 0.16,
    floorThickness: 0.12,
    frontWall: false,
    ceiling: false,
    baseboards: true,
    detail: params.detail,
  }, [
    {
      id: "suite-entry-door",
      kind: "door",
      wall: "back",
      center: -params.width * 0.37,
      width: 0.95,
      height: Math.min(2.2, params.height - 0.12),
      sill: 0,
      openness: params.openness,
    },
    {
      id: "suite-side-window",
      kind: "window",
      wall: "right",
      center: -params.depth * 0.08,
      width: Math.min(1.8, params.depth * 0.34),
      height: Math.min(1.35, params.height * 0.5),
      sill: Math.min(0.9, params.height * 0.31),
      openness: 0,
    },
  ]);
  const storageWidth = Math.min(params.width * 0.58, 5.2);
  const storageDepth = 0.42;
  const storageParts = buildStorageWallParts({
    kind: "media-wall",
    width: storageWidth,
    height: params.height * 0.86,
    depth: storageDepth,
    bays: params.bays,
    shelves: params.shelves,
    drawers: 2,
    openness: params.openness,
    detail: params.detail,
  });
  const storageZ = -params.depth * 0.5 + 0.16 + storageDepth * 0.5;
  return [
    ...roomParts.map((entry) => placeAssemblyPart(entry, "storage_room", "房间壳体", 0, 0, 0)),
    ...storageParts.map((entry) => placeAssemblyPart(entry, "storage_room", "整墙收纳", params.width * 0.08, 0, storageZ)),
  ].map((entry) => ({
    ...entry,
    metadata: { ...entry.metadata, assembly: "storage-room-suite" },
  }));
}
