/** Integrated footprint -> facade -> floors -> rooms -> stairs -> roof -> furniture grammar. */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  merge,
  ringToPlate,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

type RGB = [number, number, number];
export type ProceduralBuildingFootprint = "rectangle" | "lShape";
export type ProceduralBuildingRoof = "flat" | "gable" | "hip";
export type ProceduralRoomKind = "living" | "kitchen" | "bedroom" | "study";

export interface ProceduralBuildingParams {
  width: number;
  depth: number;
  footprintShape: ProceduralBuildingFootprint;
  /** Custom spline/polygon points. Overrides the preset footprint. */
  footprint?: ReadonlyArray<Vec3>;
  floors: number;
  floorHeight: number;
  wallThickness: number;
  facadeModule: number;
  roomColumns: number;
  corridorWidth: number;
  roofStyle: ProceduralBuildingRoof;
  roofHeight: number;
  furnished: boolean;
  furnitureDensity: number;
  exteriorDetails: boolean;
  /** Remove front facade and roof to expose generated interiors. */
  revealInterior: boolean;
  seed: number;
}

export interface ProceduralBuildingRoom {
  id: string;
  floor: number;
  kind: ProceduralRoomKind;
  min: Vec3;
  max: Vec3;
}

export interface ProceduralStairFlight {
  floor: number;
  steps: number;
  rise: number;
  tread: number;
}

export interface ProceduralBuilding {
  parts: NamedPart[];
  rooms: ProceduralBuildingRoom[];
  stairs: ProceduralStairFlight[];
}

export interface ProceduralBuildingScore {
  score: number;
  metrics: {
    exterior: number;
    interior: number;
    circulation: number;
    roof: number;
    furnishing: number;
  };
  feedback: string;
}

export const PROCEDURAL_BUILDING_DEFAULTS: ProceduralBuildingParams = {
  width: 12,
  depth: 9,
  footprintShape: "rectangle",
  floors: 3,
  floorHeight: 3,
  wallThickness: 0.22,
  facadeModule: 2.4,
  roomColumns: 3,
  corridorWidth: 1.6,
  roofStyle: "gable",
  roofHeight: 1.8,
  furnished: true,
  furnitureDensity: 0.85,
  exteriorDetails: true,
  revealInterior: false,
  seed: 41,
};

const WALL: RGB = [0.61, 0.52, 0.42];
const INNER_WALL: RGB = [0.78, 0.74, 0.66];
const SLAB: RGB = [0.42, 0.39, 0.35];
const FLOOR: RGB = [0.48, 0.31, 0.18];
const FRAME: RGB = [0.12, 0.13, 0.14];
const GLASS: RGB = [0.22, 0.48, 0.62];
const DOOR: RGB = [0.24, 0.12, 0.07];
const ROOF: RGB = [0.31, 0.09, 0.06];
const TRIM: RGB = [0.76, 0.68, 0.54];
const METAL: RGB = [0.2, 0.22, 0.24];
const WOOD: RGB = [0.42, 0.24, 0.12];
const FABRIC: RGB = [0.24, 0.37, 0.48];
const SOFT: RGB = [0.78, 0.74, 0.66];

interface Edge {
  a: Vec3;
  b: Vec3;
  length: number;
  yaw: number;
  outwardX: number;
  outwardZ: number;
}

interface BoundsXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface FurnitureMeshes {
  wood: Mesh[];
  fabric: Mesh[];
  soft: Mesh[];
  metal: Mesh[];
}

export function buildProceduralBuilding(
  params: Partial<ProceduralBuildingParams> = {},
): ProceduralBuilding {
  const p = normalizeParams(params);
  const footprint = resolveFootprint(p);
  const bounds = footprintBounds(footprint);
  const edges = polygonEdges(footprint);
  const frontEdge = findFrontEdge(edges);
  const parts: NamedPart[] = [];
  const rooms: ProceduralBuildingRoom[] = [];
  const stairInfo: ProceduralStairFlight[] = [];
  const rng = makeRng(p.seed >>> 0);
  const exteriorWalls: Mesh[] = [];
  const windowGlass: Mesh[] = [];
  const windowFrames: Mesh[] = [];
  const doors: Mesh[] = [];
  const doorFrames: Mesh[] = [];
  const slabs: Mesh[] = [];
  const floorFinishes: Mesh[] = [];
  const interiorWalls: Mesh[] = [];
  const stairs: Mesh[] = [];
  const stairRails: Mesh[] = [];
  const exteriorTrim: Mesh[] = [];
  const balconies: Mesh[] = [];
  const balconyRails: Mesh[] = [];
  const furniture: FurnitureMeshes = { wood: [], fabric: [], soft: [], metal: [] };

  slabs.push(transform(ringToPlate(footprint, 0), { translate: vec3(0, -0.12, 0) }));
  for (let floor = 0; floor < p.floors; floor++) {
    const baseY = floor * p.floorHeight;
    slabs.push(transform(ringToPlate(footprint, 0), { translate: vec3(0, baseY + 0.08, 0) }));
    floorFinishes.push(transform(ringToPlate(footprint, 0), { translate: vec3(0, baseY + 0.105, 0) }));
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      if (p.revealInterior && edgeIndex === frontEdge) continue;
      buildFacadeEdge(edges[edgeIndex]!, edgeIndex, frontEdge, floor, baseY, p, {
        walls: exteriorWalls,
        glass: windowGlass,
        frames: windowFrames,
        doors,
        doorFrames,
      });
    }
    if (p.exteriorDetails) {
      for (const edge of edges) {
        exteriorTrim.push(orientedBox(edge, edge.length + 0.08, 0.13, p.wallThickness + 0.12, baseY + p.floorHeight - 0.1));
      }
      if (floor > 0 && floor % 2 === 1 && !p.revealInterior) {
        addFrontBalcony(edges[frontEdge]!, baseY, p, balconies, balconyRails);
      }
    }
    const floorRooms = createRooms(floor, baseY, footprint, bounds, p);
    rooms.push(...floorRooms);
    buildInteriorWalls(floorRooms, baseY, p, interiorWalls);
    if (p.furnished) {
      for (const room of floorRooms) {
        if (rng.next() <= p.furnitureDensity) addFurniture(room, rng.fork(), furniture);
      }
    }
    if (floor < p.floors - 1) {
      stairInfo.push(addUStair(floor, baseY, bounds, p, stairs, stairRails));
    }
  }

  pushPart(parts, "foundation_and_slabs", "基础与楼板", slabs, SLAB, "concrete", { roughness: 0.88 });
  pushPart(parts, "floor_finishes", "室内地面", floorFinishes, FLOOR, "wood", { tone: FLOOR, seed: p.seed + 1 });
  pushPart(parts, "exterior_walls", "外墙", exteriorWalls, WALL, "brick", { color: WALL, roughness: 0.8, seed: p.seed + 2 });
  pushPart(parts, "window_glass", "窗户玻璃", windowGlass, GLASS, "glass", { tint: GLASS, roughness: 0.08 });
  pushPart(parts, "window_frames", "窗框", windowFrames, FRAME, "brushedMetal", { color: FRAME, roughness: 0.38 });
  pushPart(parts, "entrance_doors", "入口门", doors, DOOR, "wood", { tone: DOOR, seed: p.seed + 3 });
  pushPart(parts, "door_frames", "门框", doorFrames, TRIM, "wood", { tone: TRIM, seed: p.seed + 4 });
  pushPart(parts, "interior_walls", "室内隔墙", interiorWalls, INNER_WALL, "plaster", { color: INNER_WALL, roughness: 0.92 });
  pushPart(parts, "stairs", "多层楼梯", stairs, WOOD, "wood", { tone: WOOD, seed: p.seed + 5 });
  pushPart(parts, "stair_rails", "楼梯扶手", stairRails, METAL, "brushedMetal", { color: METAL });
  pushPart(parts, "exterior_trim", "外墙装饰线", exteriorTrim, TRIM, "stone", { color: TRIM, roughness: 0.72 });
  pushPart(parts, "balconies", "阳台", balconies, SLAB, "concrete", { color: SLAB, roughness: 0.85 });
  pushPart(parts, "balcony_rails", "阳台栏杆", balconyRails, METAL, "brushedMetal", { color: METAL });
  pushPart(parts, "furniture_wood", "木质家具", furniture.wood, WOOD, "wood", { tone: WOOD, seed: p.seed + 6 });
  pushPart(parts, "furniture_fabric", "布艺家具", furniture.fabric, FABRIC, "fabric", { color: FABRIC, seed: p.seed + 7 });
  pushPart(parts, "furniture_soft", "床品软装", furniture.soft, SOFT, "fabric", { color: SOFT, seed: p.seed + 8 });
  pushPart(parts, "furniture_metal", "家具金属件", furniture.metal, METAL, "brushedMetal", { color: METAL });
  if (!p.revealInterior) addRoof(parts, footprint, edges, bounds, p);

  const downpipes: Mesh[] = [];
  if (p.exteriorDetails) {
    const totalHeight = p.floors * p.floorHeight;
    const pipeOffset = p.wallThickness / 2 + 0.08;
    for (let index = 0; index < footprint.length; index++) {
      const point = footprint[index]!;
      const previousEdge = edges[(index - 1 + edges.length) % edges.length]!;
      const nextEdge = edges[index]!;
      downpipes.push(transform(cylinder(0.055, totalHeight, 10, true), {
        translate: vec3(
          point.x + (previousEdge.outwardX + nextEdge.outwardX) * pipeOffset,
          totalHeight / 2,
          point.z + (previousEdge.outwardZ + nextEdge.outwardZ) * pipeOffset,
        ),
      }));
    }
  }
  pushPart(parts, "rainwater_pipes", "雨水管", downpipes, METAL, "brushedMetal", { color: METAL });
  for (const item of parts) {
    item.metadata = {
      ...item.metadata,
      source: "Procedural Minds UE5 PCG building grammar study",
      floors: p.floors,
      footprintShape: p.footprint ? "custom" : p.footprintShape,
      revealInterior: p.revealInterior,
    };
  }
  return { parts, rooms, stairs: stairInfo };
}

export function buildProceduralBuildingParts(
  params: Partial<ProceduralBuildingParams> = {},
): NamedPart[] {
  return buildProceduralBuilding(params).parts;
}

export function scoreProceduralBuilding(scene: ProceduralBuilding): ProceduralBuildingScore {
  const names = new Set(scene.parts.map((item) => item.name));
  const exterior = ratio(names, ["foundation_and_slabs", "exterior_walls", "window_glass", "window_frames", "entrance_doors"]);
  const interior = ratio(names, ["floor_finishes", "interior_walls"]);
  const circulation = scene.stairs.length > 0 || inferFloorCount(scene.parts) === 1 ? 1 : 0;
  const roof = names.has("roof") || scene.parts.some((item) => item.metadata?.revealInterior === true) ? 1 : 0;
  const furnishing = ratio(names, ["furniture_wood", "furniture_fabric", "furniture_soft"]);
  const metrics = { exterior, interior, circulation, roof, furnishing };
  const score = exterior * 0.28 + interior * 0.24 + circulation * 0.2 + roof * 0.14 + furnishing * 0.14;
  const missing = Object.entries(metrics).filter(([, value]) => value < 0.7).map(([key]) => key);
  return {
    score,
    metrics,
    feedback: missing.length === 0
      ? `Score ${score.toFixed(2)}. Exterior and interior grammar complete.`
      : `Score ${score.toFixed(2)}. Improve: ${missing.join(", ")}.`,
  };
}

function normalizeParams(params: Partial<ProceduralBuildingParams>): ProceduralBuildingParams {
  const merged = { ...PROCEDURAL_BUILDING_DEFAULTS, ...params };
  return {
    ...merged,
    width: Math.max(6, merged.width),
    depth: Math.max(6, merged.depth),
    floors: Math.max(1, Math.min(12, Math.round(merged.floors))),
    floorHeight: Math.max(2.4, merged.floorHeight),
    wallThickness: Math.max(0.12, Math.min(0.5, merged.wallThickness)),
    facadeModule: Math.max(1.4, merged.facadeModule),
    roomColumns: Math.max(1, Math.min(6, Math.round(merged.roomColumns))),
    corridorWidth: Math.max(1.1, Math.min(2.8, merged.corridorWidth)),
    roofHeight: Math.max(0.4, merged.roofHeight),
    furnitureDensity: clamp01(merged.furnitureDensity),
    seed: Math.round(merged.seed) >>> 0,
  };
}

function resolveFootprint(p: ProceduralBuildingParams): Vec3[] {
  if (p.footprint && p.footprint.length >= 3) return p.footprint.map((point) => vec3(point.x, 0, point.z));
  const hx = p.width / 2;
  const hz = p.depth / 2;
  if (p.footprintShape === "lShape") {
    return [
      vec3(-hx, 0, -hz), vec3(hx, 0, -hz), vec3(hx, 0, hz * 0.12),
      vec3(hx * 0.12, 0, hz * 0.12), vec3(hx * 0.12, 0, hz), vec3(-hx, 0, hz),
    ];
  }
  return [vec3(-hx, 0, -hz), vec3(hx, 0, -hz), vec3(hx, 0, hz), vec3(-hx, 0, hz)];
}

function footprintBounds(points: ReadonlyArray<Vec3>): BoundsXZ {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function polygonEdges(points: ReadonlyArray<Vec3>): Edge[] {
  const edges: Edge[] = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-5) continue;
    edges.push({ a, b, length, yaw: -Math.atan2(dz, dx), outwardX: dz / length, outwardZ: -dx / length });
  }
  return edges;
}

function findFrontEdge(edges: ReadonlyArray<Edge>): number {
  let best = 0;
  let bestZ = -Infinity;
  for (let index = 0; index < edges.length; index++) {
    const averageZ = (edges[index]!.a.z + edges[index]!.b.z) / 2;
    if (averageZ > bestZ) {
      bestZ = averageZ;
      best = index;
    }
  }
  return best;
}

function buildFacadeEdge(
  edge: Edge,
  edgeIndex: number,
  frontEdge: number,
  floor: number,
  baseY: number,
  p: ProceduralBuildingParams,
  output: { walls: Mesh[]; glass: Mesh[]; frames: Mesh[]; doors: Mesh[]; doorFrames: Mesh[] },
): void {
  const bays = Math.max(1, Math.round(edge.length / p.facadeModule));
  const bayLength = edge.length / bays;
  const doorBay = Math.floor(bays / 2);
  for (let bay = 0; bay < bays; bay++) {
    const center = edgePoint(edge, (bay + 0.5) / bays);
    if (floor === 0 && edgeIndex === frontEdge && bay === doorBay) {
      addDoorBay(edge, center, bayLength, baseY, p, output.walls, output.doors, output.doorFrames);
    } else {
      addWindowBay(edge, center, bayLength, baseY, p, output.walls, output.glass, output.frames);
    }
  }
}

function addWindowBay(
  edge: Edge,
  center: Vec3,
  bayLength: number,
  baseY: number,
  p: ProceduralBuildingParams,
  walls: Mesh[],
  glass: Mesh[],
  frames: Mesh[],
): void {
  const wallHeight = p.floorHeight - 0.12;
  const openingWidth = Math.min(1.55, bayLength * 0.62);
  const sill = Math.min(0.82, wallHeight * 0.28);
  const openingHeight = Math.min(1.55, wallHeight - sill - 0.38);
  const topHeight = wallHeight - sill - openingHeight;
  const sideWidth = Math.max(0.08, (bayLength - openingWidth) / 2);
  const y0 = baseY + 0.12;
  walls.push(orientedAt(edge, center, bayLength + 0.01, sill, p.wallThickness, y0 + sill / 2));
  walls.push(orientedAt(edge, center, bayLength + 0.01, topHeight, p.wallThickness, y0 + sill + openingHeight + topHeight / 2));
  for (const side of [-1, 1] as const) {
    walls.push(orientedAt(edge, center, sideWidth, openingHeight, p.wallThickness, y0 + sill + openingHeight / 2, side * (openingWidth + sideWidth) / 2));
  }
  const windowY = y0 + sill + openingHeight / 2;
  const wallFront = p.wallThickness / 2;
  glass.push(orientedAt(edge, center, openingWidth * 0.94, openingHeight * 0.94, 0.025, windowY, 0, wallFront + 0.018));
  const stock = 0.055;
  const frameDepth = 0.06;
  const frameOutward = wallFront + frameDepth / 2 + 0.008;
  frames.push(orientedAt(edge, center, openingWidth, stock, frameDepth, windowY - openingHeight / 2, 0, frameOutward));
  frames.push(orientedAt(edge, center, openingWidth, stock, frameDepth, windowY + openingHeight / 2, 0, frameOutward));
  frames.push(orientedAt(edge, center, stock, openingHeight, frameDepth, windowY, -openingWidth / 2, frameOutward));
  frames.push(orientedAt(edge, center, stock, openingHeight, frameDepth, windowY, openingWidth / 2, frameOutward));
  frames.push(orientedAt(edge, center, stock * 0.8, openingHeight, frameDepth, windowY, 0, frameOutward));
}

function addDoorBay(
  edge: Edge,
  center: Vec3,
  bayLength: number,
  baseY: number,
  p: ProceduralBuildingParams,
  walls: Mesh[],
  doors: Mesh[],
  frames: Mesh[],
): void {
  const wallHeight = p.floorHeight - 0.12;
  const doorWidth = Math.min(1.3, bayLength * 0.62);
  const doorHeight = Math.min(2.25, wallHeight - 0.2);
  const sideWidth = Math.max(0.08, (bayLength - doorWidth) / 2);
  const topHeight = wallHeight - doorHeight;
  const y0 = baseY + 0.12;
  walls.push(orientedAt(edge, center, bayLength + 0.01, topHeight, p.wallThickness, y0 + doorHeight + topHeight / 2));
  for (const side of [-1, 1] as const) {
    walls.push(orientedAt(edge, center, sideWidth, doorHeight, p.wallThickness, y0 + doorHeight / 2, side * (doorWidth + sideWidth) / 2));
  }
  const wallFront = p.wallThickness / 2;
  doors.push(orientedAt(edge, center, doorWidth * 0.92, doorHeight * 0.96, 0.08, y0 + doorHeight * 0.48, 0, wallFront + 0.05));
  const stock = 0.07;
  const frameDepth = 0.08;
  const frameOutward = wallFront + frameDepth / 2 + 0.008;
  frames.push(orientedAt(edge, center, doorWidth + stock * 2, stock, frameDepth, y0 + doorHeight, 0, frameOutward));
  frames.push(orientedAt(edge, center, stock, doorHeight, frameDepth, y0 + doorHeight / 2, -doorWidth / 2 - stock / 2, frameOutward));
  frames.push(orientedAt(edge, center, stock, doorHeight, frameDepth, y0 + doorHeight / 2, doorWidth / 2 + stock / 2, frameOutward));
}

function createRooms(
  floor: number,
  baseY: number,
  footprint: ReadonlyArray<Vec3>,
  bounds: BoundsXZ,
  p: ProceduralBuildingParams,
): ProceduralBuildingRoom[] {
  const inset = p.wallThickness + 0.12;
  const minX = bounds.minX + inset;
  const maxX = bounds.maxX - inset;
  const minZ = bounds.minZ + inset;
  const maxZ = bounds.maxZ - inset;
  const corridorHalf = Math.min((maxZ - minZ) * 0.3, p.corridorWidth / 2);
  const columnWidth = (maxX - minX) / p.roomColumns;
  const rows = [{ minZ, maxZ: -corridorHalf }, { minZ: corridorHalf, maxZ }];
  const rooms: ProceduralBuildingRoom[] = [];
  let roomIndex = 0;
  for (let row = 0; row < rows.length; row++) {
    const zRange = rows[row]!;
    if (zRange.maxZ - zRange.minZ < 1.4) continue;
    for (let column = 0; column < p.roomColumns; column++) {
      const roomMinX = minX + column * columnWidth;
      const roomMaxX = roomMinX + columnWidth;
      if (!rectInsidePolygon(roomMinX + 0.05, roomMaxX - 0.05, zRange.minZ + 0.05, zRange.maxZ - 0.05, footprint)) continue;
      const kind = roomKind(floor, row, column, p.roomColumns);
      rooms.push({
        id: `floor_${floor + 1}_${kind}_${roomIndex + 1}`,
        floor,
        kind,
        min: vec3(roomMinX, baseY + 0.11, zRange.minZ),
        max: vec3(roomMaxX, baseY + p.floorHeight - 0.12, zRange.maxZ),
      });
      roomIndex++;
    }
  }
  return rooms;
}

function roomKind(floor: number, row: number, column: number, columns: number): ProceduralRoomKind {
  if (floor === 0 && row === 1 && column === Math.floor(columns / 2)) return "living";
  if (floor === 0 && row === 0 && column === 0) return "kitchen";
  const kinds: ProceduralRoomKind[] = ["bedroom", "study", "bedroom", "living"];
  return kinds[(floor * columns * 2 + row * columns + column) % kinds.length]!;
}

function buildInteriorWalls(
  rooms: ReadonlyArray<ProceduralBuildingRoom>,
  baseY: number,
  p: ProceduralBuildingParams,
  output: Mesh[],
): void {
  const wallHeight = p.floorHeight - 0.24;
  const centreY = baseY + 0.12 + wallHeight / 2;
  const grouped = new Map<string, ProceduralBuildingRoom[]>();
  for (const room of rooms) {
    const key = room.min.z < 0 ? "back" : "front";
    const row = grouped.get(key) ?? [];
    row.push(room);
    grouped.set(key, row);
  }
  for (const row of grouped.values()) {
    row.sort((a, b) => a.min.x - b.min.x);
    for (let index = 0; index < row.length; index++) {
      const room = row[index]!;
      const corridorZ = room.min.z < 0 ? room.max.z : room.min.z;
      const doorWidth = Math.min(0.95, (room.max.x - room.min.x) * 0.32);
      const doorHeight = Math.min(2.15, wallHeight - 0.08);
      const roomCentreX = (room.min.x + room.max.x) / 2;
      const leftLength = roomCentreX - doorWidth / 2 - room.min.x;
      const rightLength = room.max.x - roomCentreX - doorWidth / 2;
      if (leftLength > 0.04) output.push(transform(box(leftLength, wallHeight, p.wallThickness), {
        translate: vec3(room.min.x + leftLength / 2, centreY, corridorZ),
      }));
      if (rightLength > 0.04) output.push(transform(box(rightLength, wallHeight, p.wallThickness), {
        translate: vec3(roomCentreX + doorWidth / 2 + rightLength / 2, centreY, corridorZ),
      }));
      output.push(transform(box(doorWidth, wallHeight - doorHeight, p.wallThickness), {
        translate: vec3(roomCentreX, baseY + 0.12 + doorHeight + (wallHeight - doorHeight) / 2, corridorZ),
      }));
      if (index > 0) {
        const previous = row[index - 1]!;
        if (Math.abs(previous.max.x - room.min.x) < 0.02) {
          const depth = room.max.z - room.min.z;
          output.push(transform(box(p.wallThickness, wallHeight, depth), {
            translate: vec3(room.min.x, centreY, (room.min.z + room.max.z) / 2),
          }));
        }
      }
    }
  }
}

function addUStair(
  floor: number,
  baseY: number,
  bounds: BoundsXZ,
  p: ProceduralBuildingParams,
  stepsOut: Mesh[],
  railsOut: Mesh[],
): ProceduralStairFlight {
  const rawSteps = Math.max(12, Math.ceil(p.floorHeight / 0.18));
  const steps = rawSteps % 2 === 0 ? rawSteps : rawSteps + 1;
  const half = steps / 2;
  const rise = p.floorHeight / steps;
  const availableWidth = Math.max(2.2, bounds.maxX - bounds.minX - p.wallThickness * 4);
  const tread = Math.min(0.28, availableWidth * 0.42 / half);
  const flightLength = tread * half;
  const stairWidth = Math.min(1.05, p.corridorWidth * 0.56);
  const gap = 0.14;
  const startX = -flightLength / 2;
  const zA = -stairWidth / 2 - gap / 2;
  const zB = stairWidth / 2 + gap / 2;
  for (let index = 0; index < half; index++) {
    const height = (index + 1) * rise;
    stepsOut.push(transform(box(tread, height, stairWidth), {
      translate: vec3(startX + (index + 0.5) * tread, baseY + height / 2 + 0.11, zA),
    }));
  }
  const landingX = startX + flightLength + tread * 0.45;
  stepsOut.push(transform(box(tread * 1.1, rise * half, stairWidth * 2 + gap), {
    translate: vec3(landingX, baseY + rise * half / 2 + 0.11, 0),
  }));
  for (let index = 0; index < half; index++) {
    const height = (half + index + 1) * rise;
    stepsOut.push(transform(box(tread, height, stairWidth), {
      translate: vec3(startX + flightLength - (index + 0.5) * tread, baseY + height / 2 + 0.11, zB),
    }));
  }
  const angle = Math.atan2(p.floorHeight / 2, flightLength);
  for (const z of [zA - stairWidth / 2, zB + stairWidth / 2]) {
    railsOut.push(transform(box(flightLength + tread, 0.045, 0.045), {
      rotate: vec3(0, 0, angle),
      translate: vec3(0, baseY + p.floorHeight * 0.28 + 0.88, z),
    }));
  }
  return { floor, steps, rise, tread };
}

function addFurniture(room: ProceduralBuildingRoom, rng: ReturnType<typeof makeRng>, output: FurnitureMeshes): void {
  const width = room.max.x - room.min.x;
  const depth = room.max.z - room.min.z;
  const centreX = (room.min.x + room.max.x) / 2;
  const centreZ = (room.min.z + room.max.z) / 2;
  const baseY = room.min.y + 0.03;
  const jitterX = rng.range(-0.08, 0.08) * width;
  const outerZ = centreZ < 0 ? room.min.z + depth * 0.28 : room.max.z - depth * 0.28;
  if (room.kind === "bedroom") {
    const bedWidth = Math.min(1.5, width * 0.62);
    const bedDepth = Math.min(2.05, depth * 0.64);
    output.wood.push(transform(box(bedWidth + 0.12, 0.24, bedDepth + 0.12), { translate: vec3(centreX + jitterX, baseY + 0.12, outerZ) }));
    output.soft.push(transform(box(bedWidth, 0.24, bedDepth), { translate: vec3(centreX + jitterX, baseY + 0.34, outerZ) }));
    output.soft.push(transform(box(bedWidth * 0.72, 0.14, bedDepth * 0.28), {
      translate: vec3(centreX + jitterX, baseY + 0.53, outerZ + (centreZ < 0 ? -1 : 1) * bedDepth * 0.31),
    }));
    addCabinet(room, output.wood, 0.78, 1.2);
  } else if (room.kind === "kitchen") {
    const counterWidth = Math.max(1.1, width * 0.76);
    output.wood.push(transform(box(counterWidth, 0.88, 0.58), { translate: vec3(centreX, baseY + 0.44, outerZ) }));
    output.metal.push(transform(box(counterWidth * 0.96, 0.055, 0.5), { translate: vec3(centreX, baseY + 0.91, outerZ) }));
    addTableAndChairs(room, output, 0.72);
  } else if (room.kind === "living") {
    const sofaWidth = Math.max(1.2, Math.min(2.4, width * 0.74));
    output.fabric.push(transform(box(sofaWidth, 0.46, 0.68), { translate: vec3(centreX + jitterX, baseY + 0.23, outerZ) }));
    output.fabric.push(transform(box(sofaWidth, 0.64, 0.16), {
      translate: vec3(centreX + jitterX, baseY + 0.58, outerZ + (centreZ < 0 ? -0.3 : 0.3)),
    }));
    output.wood.push(transform(box(Math.min(1.2, width * 0.44), 0.34, 0.62), { translate: vec3(centreX, baseY + 0.17, centreZ) }));
    addCabinet(room, output.wood, 1.05, 0.72);
  } else {
    addTableAndChairs(room, output, 0.82);
    addCabinet(room, output.wood, 0.9, 1.55);
  }
}

function addTableAndChairs(room: ProceduralBuildingRoom, output: FurnitureMeshes, scale: number): void {
  const centreX = (room.min.x + room.max.x) / 2;
  const centreZ = (room.min.z + room.max.z) / 2;
  const baseY = room.min.y + 0.03;
  const tableWidth = Math.min(1.4, (room.max.x - room.min.x) * 0.56) * scale;
  const tableDepth = Math.min(0.8, (room.max.z - room.min.z) * 0.34) * scale;
  output.wood.push(transform(box(tableWidth, 0.1, tableDepth), { translate: vec3(centreX, baseY + 0.72, centreZ) }));
  for (const side of [-1, 1] as const) {
    const chairX = centreX + side * (tableWidth * 0.62 + 0.28);
    output.wood.push(transform(box(0.08, 0.7, 0.08), {
      translate: vec3(centreX + side * tableWidth * 0.4, baseY + 0.35, centreZ - tableDepth * 0.34),
    }));
    output.fabric.push(transform(box(0.46 * scale, 0.1, 0.43 * scale), {
      translate: vec3(chairX, baseY + 0.46, centreZ),
    }));
    for (const legX of [-0.16, 0.16]) {
      for (const legZ of [-0.14, 0.14]) {
        output.wood.push(transform(box(0.045, 0.42, 0.045), {
          translate: vec3(chairX + legX * scale, baseY + 0.21, centreZ + legZ * scale),
        }));
      }
    }
  }
}

function addCabinet(room: ProceduralBuildingRoom, output: Mesh[], width: number, height: number): void {
  const x = room.max.x - Math.min(0.5, (room.max.x - room.min.x) * 0.18);
  const z = room.min.z < 0 ? room.min.z + 0.24 : room.max.z - 0.24;
  output.push(transform(box(Math.min(width, room.max.x - room.min.x - 0.3), height, 0.42), {
    translate: vec3(x, room.min.y + height / 2 + 0.03, z),
  }));
}

function addFrontBalcony(edge: Edge, baseY: number, p: ProceduralBuildingParams, slabs: Mesh[], rails: Mesh[]): void {
  const width = Math.min(edge.length * 0.42, p.facadeModule * 1.8);
  const depth = 0.95;
  const centre = edgePoint(edge, 0.5, depth * 0.45);
  slabs.push(transform(box(width, 0.14, depth), {
    rotate: vec3(0, edge.yaw, 0),
    translate: vec3(centre.x, baseY + 0.17, centre.z),
  }));
  const railCentre = edgePoint(edge, 0.5, depth * 0.94);
  rails.push(transform(box(width, 0.055, 0.055), {
    rotate: vec3(0, edge.yaw, 0),
    translate: vec3(railCentre.x, baseY + 1.12, railCentre.z),
  }));
  const count = Math.max(3, Math.round(width / 0.45));
  for (let index = 0; index <= count; index++) {
    const point = localOffset(edge, railCentre, -width / 2 + width * (index / count));
    rails.push(transform(box(0.045, 0.92, 0.045), {
      rotate: vec3(0, edge.yaw, 0),
      translate: vec3(point.x, baseY + 0.65, point.z),
    }));
  }
}

function addRoof(
  parts: NamedPart[],
  footprint: ReadonlyArray<Vec3>,
  edges: ReadonlyArray<Edge>,
  bounds: BoundsXZ,
  p: ProceduralBuildingParams,
): void {
  const topY = p.floors * p.floorHeight;
  if (p.roofStyle === "flat" || p.footprint || p.footprintShape === "lShape") {
    parts.push(part("roof", "屋顶", transform(ringToPlate(footprint, 0), { translate: vec3(0, topY + 0.06, 0) }), ROOF, "concrete", { color: ROOF, roughness: 0.88 }));
    parts.push(part("roof_parapet", "屋顶女儿墙", merge(...edges.map((edge) => orientedBox(edge, edge.length + 0.08, 0.42, p.wallThickness, topY + 0.24))), TRIM, "stone", { color: TRIM, roughness: 0.74 }));
    return;
  }
  const roofMesh = buildRoofGeneratorMesh({
    style: p.roofStyle,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ,
    wallHeight: topY,
    roofHeight: p.roofHeight,
    overhang: 0.38,
    dormers: p.exteriorDetails ? Math.max(0, Math.round((bounds.maxX - bounds.minX) / 6) - 1) : 0,
    chimney: p.exteriorDetails,
    rafters: p.exteriorDetails,
    seed: p.seed + 9,
  });
  parts.push(part("roof", "坡屋顶", roofMesh, ROOF, "ceramic", { color: ROOF, roughness: 0.68 }));
}

function orientedBox(edge: Edge, width: number, height: number, depth: number, centreY: number): Mesh {
  const centre = edgePoint(edge, 0.5);
  return transform(box(width, height, depth), { rotate: vec3(0, edge.yaw, 0), translate: vec3(centre.x, centreY, centre.z) });
}

function orientedAt(edge: Edge, centre: Vec3, width: number, height: number, depth: number, centreY: number, offsetX = 0, outward = 0): Mesh {
  const point = localOffset(edge, centre, offsetX);
  return transform(box(width, height, depth), {
    rotate: vec3(0, edge.yaw, 0),
    translate: vec3(point.x + edge.outwardX * outward, centreY, point.z + edge.outwardZ * outward),
  });
}

function edgePoint(edge: Edge, t: number, outward = 0): Vec3 {
  return vec3(
    edge.a.x + (edge.b.x - edge.a.x) * t + edge.outwardX * outward,
    0,
    edge.a.z + (edge.b.z - edge.a.z) * t + edge.outwardZ * outward,
  );
}

function localOffset(edge: Edge, centre: Vec3, offset: number): Vec3 {
  return vec3(
    centre.x + ((edge.b.x - edge.a.x) / edge.length) * offset,
    centre.y,
    centre.z + ((edge.b.z - edge.a.z) / edge.length) * offset,
  );
}

function rectInsidePolygon(minX: number, maxX: number, minZ: number, maxZ: number, polygon: ReadonlyArray<Vec3>): boolean {
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [(minX + maxX) / 2, (minZ + maxZ) / 2]]
    .every(([x, z]) => pointInPolygon(x!, z!, polygon));
}

function pointInPolygon(x: number, z: number, polygon: ReadonlyArray<Vec3>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (((a.z > z) !== (b.z > z)) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

function pushPart(parts: NamedPart[], name: string, label: string, meshes: Mesh[], color: RGB, surface: string, params: Record<string, unknown>): void {
  if (meshes.length > 0) parts.push(part(name, label, merge(...meshes), color, surface, params));
}

function part(name: string, label: string, mesh: Mesh, color: RGB, surface: string, params: Record<string, unknown>): NamedPart {
  return { name, label, mesh, color, surface: { type: surface, params } };
}

function ratio(names: Set<string>, required: string[]): number {
  return required.filter((name) => names.has(name)).length / required.length;
}

function inferFloorCount(parts: NamedPart[]): number {
  const floors = parts[0]?.metadata?.floors;
  return typeof floors === "number" ? floors : 1;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
