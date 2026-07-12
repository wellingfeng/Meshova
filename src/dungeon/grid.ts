import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cylinder,
  merge,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

export type DungeonCellType = "empty" | "room" | "corridor";

export interface DungeonGridPoint {
  readonly x: number;
  readonly z: number;
}

export interface DungeonCell extends DungeonGridPoint {
  readonly type: DungeonCellType;
  readonly roomId?: number;
}

export interface GridDungeonRoom {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly center: DungeonGridPoint;
}

export interface GridDungeonConnection {
  readonly roomA: number;
  readonly roomB: number;
  readonly path: ReadonlyArray<DungeonGridPoint>;
  readonly loop: boolean;
}

export type DungeonMarkerType =
  | "roomFloor"
  | "corridorFloor"
  | "wall"
  | "door"
  | "entry"
  | "exit";

export interface DungeonMarker {
  readonly id: number;
  readonly type: DungeonMarkerType;
  /** Grid-space center. Integer coordinates are tile boundaries. */
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly roomId?: number;
}

export interface GridDungeonConfig {
  readonly width: number;
  readonly depth: number;
  readonly roomCount: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly roomPadding: number;
  readonly loopChance: number;
  readonly tileSize: number;
  readonly floorThickness: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly seed: number;
}

export interface GridDungeonLayout {
  readonly config: GridDungeonConfig;
  readonly cells: ReadonlyArray<DungeonCell>;
  readonly rooms: ReadonlyArray<GridDungeonRoom>;
  readonly connections: ReadonlyArray<GridDungeonConnection>;
  readonly markers: ReadonlyArray<DungeonMarker>;
  readonly entryRoomId: number;
  readonly exitRoomId: number;
}

export interface DungeonThemeContext {
  readonly layout: GridDungeonLayout;
  readonly tileSize: number;
  readonly floorThickness: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
}

export type DungeonMarkerMeshFactory = (
  marker: DungeonMarker,
  context: DungeonThemeContext,
) => Mesh;

export interface DungeonThemeRule {
  readonly marker: DungeonMarkerType;
  readonly partName: string;
  readonly label: string;
  readonly color: [number, number, number];
  readonly surface?: PartSurfaceRef;
  readonly build?: DungeonMarkerMeshFactory;
}

export interface DungeonTheme {
  readonly name: string;
  readonly rules: ReadonlyArray<DungeonThemeRule>;
}

export interface BuiltGridDungeon {
  readonly layout: GridDungeonLayout;
  readonly parts: NamedPart[];
}

export const GRID_DUNGEON_DEFAULTS: GridDungeonConfig = {
  width: 34,
  depth: 26,
  roomCount: 12,
  minRoomSize: 4,
  maxRoomSize: 8,
  roomPadding: 1,
  loopChance: 0.18,
  tileSize: 1,
  floorThickness: 0.12,
  wallHeight: 1.25,
  wallThickness: 0.14,
  seed: 1337,
};

const STONE_FLOOR: [number, number, number] = [0.31, 0.29, 0.26];
const STONE_CORRIDOR: [number, number, number] = [0.25, 0.23, 0.21];
const STONE_WALL: [number, number, number] = [0.43, 0.4, 0.35];
const DARK_METAL: [number, number, number] = [0.16, 0.14, 0.12];
const ENTRY_COLOR: [number, number, number] = [0.16, 0.75, 0.38];
const EXIT_COLOR: [number, number, number] = [0.86, 0.24, 0.18];

export const STONE_DUNGEON_THEME: DungeonTheme = {
  name: "stone",
  rules: [
    themeRule("roomFloor", "dungeon_room_floors", "房间地面", STONE_FLOOR, "stone"),
    themeRule("corridorFloor", "dungeon_corridor_floors", "走廊地面", STONE_CORRIDOR, "stone"),
    themeRule("wall", "dungeon_walls", "地牢墙体", STONE_WALL, "stone"),
    themeRule("door", "dungeon_doors", "房间门框", DARK_METAL, "metal"),
    themeRule("entry", "dungeon_entry", "地牢入口", ENTRY_COLOR, "emissive"),
    themeRule("exit", "dungeon_exit", "地牢出口", EXIT_COLOR, "emissive"),
  ],
};

export const CRYPT_DUNGEON_THEME: DungeonTheme = {
  name: "crypt",
  rules: [
    themeRule("roomFloor", "crypt_room_floors", "墓室地面", [0.2, 0.24, 0.22], "mossyStone"),
    themeRule("corridorFloor", "crypt_corridor_floors", "墓道地面", [0.16, 0.19, 0.17], "mossyStone"),
    themeRule("wall", "crypt_walls", "墓穴墙体", [0.3, 0.34, 0.31], "mossyStone"),
    themeRule("door", "crypt_doors", "墓穴门框", [0.23, 0.18, 0.12], "wood"),
    themeRule("entry", "crypt_entry", "墓穴入口", [0.22, 0.62, 0.38], "emissive"),
    themeRule("exit", "crypt_exit", "墓穴出口", [0.62, 0.18, 0.12], "emissive"),
  ],
};

export const TECH_DUNGEON_THEME: DungeonTheme = {
  name: "tech",
  rules: [
    themeRule("roomFloor", "tech_room_floors", "舱室地板", [0.18, 0.22, 0.27], "metal"),
    themeRule("corridorFloor", "tech_corridor_floors", "通道地板", [0.1, 0.13, 0.17], "metal"),
    themeRule("wall", "tech_walls", "模块墙体", [0.28, 0.34, 0.4], "metal"),
    themeRule("door", "tech_doors", "气密门框", [0.68, 0.43, 0.08], "metal"),
    themeRule("entry", "tech_entry", "设施入口", [0.08, 0.68, 0.92], "emissive"),
    themeRule("exit", "tech_exit", "设施出口", [0.92, 0.22, 0.12], "emissive"),
  ],
};

interface MutableCell {
  x: number;
  z: number;
  type: DungeonCellType;
  roomId?: number;
}

interface CandidateEdge {
  roomA: number;
  roomB: number;
  distance: number;
}

export function buildGridDungeonLayout(
  config: Partial<GridDungeonConfig> = {},
): GridDungeonLayout {
  const resolved = resolveConfig(config);
  const rng = makeRng(resolved.seed);
  const cells = createCells(resolved.width, resolved.depth);
  const rooms = placeRooms(resolved, rng.fork());
  for (const room of rooms) carveRoom(cells, resolved.width, room);

  const graphEdges = connectRooms(rooms, resolved.loopChance, rng.fork());
  const connections = graphEdges.map((edge) => {
    const path = carveCorridor(
      cells,
      resolved.width,
      rooms[edge.roomA]!.center,
      rooms[edge.roomB]!.center,
      rng,
    );
    return { ...edge, path };
  });
  const [entryRoomId, exitRoomId] = findFurthestRooms(rooms, connections);
  const markers = emitMarkers(cells, rooms, resolved, entryRoomId, exitRoomId);

  return {
    config: resolved,
    cells: cells.map(toReadonlyCell),
    rooms,
    connections,
    markers,
    entryRoomId,
    exitRoomId,
  };
}

export function buildGridDungeon(
  config: Partial<GridDungeonConfig> = {},
  theme: DungeonTheme = STONE_DUNGEON_THEME,
): BuiltGridDungeon {
  const layout = buildGridDungeonLayout(config);
  return { layout, parts: buildDungeonThemeParts(layout, theme) };
}

export function buildDungeonThemeParts(
  layout: GridDungeonLayout,
  theme: DungeonTheme = STONE_DUNGEON_THEME,
): NamedPart[] {
  const context: DungeonThemeContext = {
    layout,
    tileSize: layout.config.tileSize,
    floorThickness: layout.config.floorThickness,
    wallHeight: layout.config.wallHeight,
    wallThickness: layout.config.wallThickness,
  };
  const groups = new Map<string, { rule: DungeonThemeRule; meshes: Mesh[]; count: number }>();
  const rules = new Map(theme.rules.map((rule) => [rule.marker, rule]));
  for (const marker of layout.markers) {
    const rule = rules.get(marker.type);
    if (!rule) continue;
    let group = groups.get(rule.partName);
    if (!group) {
      group = { rule, meshes: [], count: 0 };
      groups.set(rule.partName, group);
    }
    group.meshes.push((rule.build ?? defaultMarkerMesh)(marker, context));
    group.count++;
  }
  return [...groups.values()]
    .filter((group) => group.meshes.length > 0)
    .map(({ rule, meshes, count }) => {
      const part: NamedPart = {
        name: rule.partName,
        label: rule.label,
        mesh: merge(...meshes),
        color: rule.color,
        metadata: { marker: rule.marker, markerCount: count, theme: theme.name },
      };
      if (rule.surface) part.surface = rule.surface;
      return part;
    });
}

export function dungeonCellAt(
  layout: GridDungeonLayout,
  x: number,
  z: number,
): DungeonCell | undefined {
  if (x < 0 || z < 0 || x >= layout.config.width || z >= layout.config.depth) return undefined;
  return layout.cells[z * layout.config.width + x];
}

export function dungeonRoomGraph(layout: GridDungeonLayout): ReadonlyMap<number, ReadonlyArray<number>> {
  const graph = new Map<number, number[]>();
  for (const room of layout.rooms) graph.set(room.id, []);
  for (const connection of layout.connections) {
    graph.get(connection.roomA)!.push(connection.roomB);
    graph.get(connection.roomB)!.push(connection.roomA);
  }
  return graph;
}

function themeRule(
  marker: DungeonMarkerType,
  partName: string,
  label: string,
  color: [number, number, number],
  surfaceType: string,
): DungeonThemeRule {
  return {
    marker,
    partName,
    label,
    color,
    surface: { type: surfaceType, params: { color, roughness: marker === "entry" || marker === "exit" ? 0.28 : 0.86 } },
  };
}

function resolveConfig(config: Partial<GridDungeonConfig>): GridDungeonConfig {
  const width = Math.max(12, Math.round(config.width ?? GRID_DUNGEON_DEFAULTS.width));
  const depth = Math.max(12, Math.round(config.depth ?? GRID_DUNGEON_DEFAULTS.depth));
  const minRoomSize = Math.max(3, Math.round(config.minRoomSize ?? GRID_DUNGEON_DEFAULTS.minRoomSize));
  const maxAllowed = Math.max(minRoomSize, Math.min(width - 3, depth - 3));
  const maxRoomSize = Math.min(maxAllowed, Math.max(minRoomSize, Math.round(config.maxRoomSize ?? GRID_DUNGEON_DEFAULTS.maxRoomSize)));
  return {
    width,
    depth,
    roomCount: Math.max(2, Math.round(config.roomCount ?? GRID_DUNGEON_DEFAULTS.roomCount)),
    minRoomSize,
    maxRoomSize,
    roomPadding: Math.max(0, Math.round(config.roomPadding ?? GRID_DUNGEON_DEFAULTS.roomPadding)),
    loopChance: clamp01(config.loopChance ?? GRID_DUNGEON_DEFAULTS.loopChance),
    tileSize: positive(config.tileSize, GRID_DUNGEON_DEFAULTS.tileSize),
    floorThickness: positive(config.floorThickness, GRID_DUNGEON_DEFAULTS.floorThickness),
    wallHeight: positive(config.wallHeight, GRID_DUNGEON_DEFAULTS.wallHeight),
    wallThickness: positive(config.wallThickness, GRID_DUNGEON_DEFAULTS.wallThickness),
    seed: Math.round(config.seed ?? GRID_DUNGEON_DEFAULTS.seed) >>> 0,
  };
}

function createCells(width: number, depth: number): MutableCell[] {
  return Array.from({ length: width * depth }, (_, index) => ({
    x: index % width,
    z: Math.floor(index / width),
    type: "empty",
  }));
}

function placeRooms(config: GridDungeonConfig, rng: Rng): GridDungeonRoom[] {
  const rooms: GridDungeonRoom[] = [];
  const attempts = Math.max(80, config.roomCount * 60);
  for (let attempt = 0; attempt < attempts && rooms.length < config.roomCount; attempt++) {
    const width = rng.int(config.minRoomSize, config.maxRoomSize);
    const depth = rng.int(config.minRoomSize, config.maxRoomSize);
    if (width > config.width - 2 || depth > config.depth - 2) continue;
    const x = rng.int(1, config.width - width - 1);
    const z = rng.int(1, config.depth - depth - 1);
    const candidate = makeRoom(rooms.length, x, z, width, depth);
    if (rooms.some((room) => roomsOverlap(room, candidate, config.roomPadding))) continue;
    rooms.push(candidate);
  }
  if (rooms.length >= 2) return rooms;

  const fallbackSize = Math.max(3, Math.min(config.minRoomSize, 5));
  return [
    makeRoom(0, 1, 1, fallbackSize, fallbackSize),
    makeRoom(1, config.width - fallbackSize - 1, config.depth - fallbackSize - 1, fallbackSize, fallbackSize),
  ];
}

function makeRoom(id: number, x: number, z: number, width: number, depth: number): GridDungeonRoom {
  return {
    id,
    x,
    z,
    width,
    depth,
    center: { x: x + Math.floor(width / 2), z: z + Math.floor(depth / 2) },
  };
}

function roomsOverlap(a: GridDungeonRoom, b: GridDungeonRoom, padding: number): boolean {
  return a.x - padding < b.x + b.width
    && a.x + a.width + padding > b.x
    && a.z - padding < b.z + b.depth
    && a.z + a.depth + padding > b.z;
}

function carveRoom(cells: MutableCell[], width: number, room: GridDungeonRoom): void {
  for (let z = room.z; z < room.z + room.depth; z++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      const cell = cells[z * width + x]!;
      cell.type = "room";
      cell.roomId = room.id;
    }
  }
}

function connectRooms(rooms: readonly GridDungeonRoom[], loopChance: number, rng: Rng): Array<Omit<GridDungeonConnection, "path">> {
  const candidates: CandidateEdge[] = [];
  for (let roomA = 0; roomA < rooms.length; roomA++) {
    for (let roomB = roomA + 1; roomB < rooms.length; roomB++) {
      const a = rooms[roomA]!.center;
      const b = rooms[roomB]!.center;
      candidates.push({ roomA, roomB, distance: Math.hypot(a.x - b.x, a.z - b.z) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.roomA - b.roomA || a.roomB - b.roomB);

  const connected = new Set<number>([0]);
  const chosen: Array<Omit<GridDungeonConnection, "path">> = [];
  const chosenKeys = new Set<string>();
  while (connected.size < rooms.length) {
    const edge = candidates.find((candidate) => connected.has(candidate.roomA) !== connected.has(candidate.roomB));
    if (!edge) throw new Error("failed to connect dungeon room graph");
    chosen.push({ roomA: edge.roomA, roomB: edge.roomB, loop: false });
    chosenKeys.add(edgeKey(edge.roomA, edge.roomB));
    connected.add(edge.roomA);
    connected.add(edge.roomB);
  }

  const extras = candidates
    .filter((edge) => !chosenKeys.has(edgeKey(edge.roomA, edge.roomB)))
    .map((edge) => ({ edge, order: rng.next() }))
    .sort((a, b) => a.order - b.order);
  const extraCount = Math.min(extras.length, Math.round(rooms.length * loopChance));
  for (let index = 0; index < extraCount; index++) {
    const edge = extras[index]!.edge;
    chosen.push({ roomA: edge.roomA, roomB: edge.roomB, loop: true });
  }
  return chosen;
}

function carveCorridor(
  cells: MutableCell[],
  width: number,
  start: DungeonGridPoint,
  end: DungeonGridPoint,
  rng: Rng,
): DungeonGridPoint[] {
  const path: DungeonGridPoint[] = [];
  let x = start.x;
  let z = start.z;
  const horizontalFirst = rng.next() < 0.5;
  const carveStep = (): void => {
    const cell = cells[z * width + x]!;
    if (cell.type === "empty") cell.type = "corridor";
    path.push({ x, z });
  };
  carveStep();
  const moveX = (): void => {
    while (x !== end.x) {
      x += Math.sign(end.x - x);
      carveStep();
    }
  };
  const moveZ = (): void => {
    while (z !== end.z) {
      z += Math.sign(end.z - z);
      carveStep();
    }
  };
  if (horizontalFirst) {
    moveX();
    moveZ();
  } else {
    moveZ();
    moveX();
  }
  return path;
}

function findFurthestRooms(
  rooms: readonly GridDungeonRoom[],
  connections: readonly GridDungeonConnection[],
): [number, number] {
  const graph = new Map<number, number[]>();
  for (const room of rooms) graph.set(room.id, []);
  for (const connection of connections) {
    graph.get(connection.roomA)!.push(connection.roomB);
    graph.get(connection.roomB)!.push(connection.roomA);
  }
  let best: [number, number] = [0, Math.min(1, rooms.length - 1)];
  let bestDistance = -1;
  for (const room of rooms) {
    const distances = graphDistances(graph, room.id);
    for (const [target, distance] of distances) {
      if (distance > bestDistance || (distance === bestDistance && `${room.id},${target}` < `${best[0]},${best[1]}`)) {
        best = [room.id, target];
        bestDistance = distance;
      }
    }
  }
  return best;
}

function graphDistances(graph: ReadonlyMap<number, readonly number[]>, start: number): Map<number, number> {
  const distance = new Map<number, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const next of graph.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(current)! + 1);
      queue.push(next);
    }
  }
  return distance;
}

function emitMarkers(
  cells: readonly MutableCell[],
  rooms: readonly GridDungeonRoom[],
  config: GridDungeonConfig,
  entryRoomId: number,
  exitRoomId: number,
): DungeonMarker[] {
  const markers: DungeonMarker[] = [];
  const doors = new Set<string>();
  const emit = (marker: Omit<DungeonMarker, "id">): void => {
    markers.push({ id: markers.length, ...marker });
  };
  const directions = [
    { dx: 0, dz: -1, ox: 0.5, oz: 0, rotationY: 0 },
    { dx: 1, dz: 0, ox: 1, oz: 0.5, rotationY: Math.PI / 2 },
    { dx: 0, dz: 1, ox: 0.5, oz: 1, rotationY: 0 },
    { dx: -1, dz: 0, ox: 0, oz: 0.5, rotationY: Math.PI / 2 },
  ] as const;

  for (const cell of cells) {
    if (cell.type === "empty") continue;
    const floor = {
      type: cell.type === "room" ? "roomFloor" : "corridorFloor",
      x: cell.x + 0.5,
      z: cell.z + 0.5,
      rotationY: 0,
      ...(cell.roomId !== undefined ? { roomId: cell.roomId } : {}),
    } satisfies Omit<DungeonMarker, "id">;
    emit(floor);

    for (const direction of directions) {
      const neighbor = mutableCellAt(cells, config.width, config.depth, cell.x + direction.dx, cell.z + direction.dz);
      if (!neighbor || neighbor.type === "empty") {
        const wall = {
          type: "wall",
          x: cell.x + direction.ox,
          z: cell.z + direction.oz,
          rotationY: direction.rotationY,
          ...(cell.roomId !== undefined ? { roomId: cell.roomId } : {}),
        } satisfies Omit<DungeonMarker, "id">;
        emit(wall);
        continue;
      }
      if (cell.type === neighbor.type || cell.type === "corridor") continue;
      const key = boundaryKey(cell.x, cell.z, neighbor.x, neighbor.z);
      if (doors.has(key)) continue;
      doors.add(key);
      const door = {
        type: "door",
        x: cell.x + direction.ox,
        z: cell.z + direction.oz,
        rotationY: direction.rotationY,
        ...(cell.roomId !== undefined ? { roomId: cell.roomId } : {}),
      } satisfies Omit<DungeonMarker, "id">;
      emit(door);
    }
  }

  const entry = rooms[entryRoomId]!;
  const exit = rooms[exitRoomId]!;
  emit({ type: "entry", x: entry.center.x + 0.5, z: entry.center.z + 0.5, rotationY: 0, roomId: entryRoomId });
  emit({ type: "exit", x: exit.center.x + 0.5, z: exit.center.z + 0.5, rotationY: 0, roomId: exitRoomId });
  return markers;
}

function defaultMarkerMesh(marker: DungeonMarker, context: DungeonThemeContext): Mesh {
  const centerX = (marker.x - context.layout.config.width / 2) * context.tileSize;
  const centerZ = (marker.z - context.layout.config.depth / 2) * context.tileSize;
  if (marker.type === "roomFloor" || marker.type === "corridorFloor") {
    return transform(box(context.tileSize, context.floorThickness, context.tileSize), {
      translate: vec3(centerX, -context.floorThickness * 0.5, centerZ),
    });
  }
  if (marker.type === "wall") {
    return transform(box(context.tileSize + context.wallThickness * 0.3, context.wallHeight, context.wallThickness), {
      rotate: vec3(0, marker.rotationY, 0),
      translate: vec3(centerX, context.wallHeight * 0.5, centerZ),
    });
  }
  if (marker.type === "door") {
    const clearWidth = context.tileSize * 0.62;
    const frameWidth = Math.max(context.wallThickness * 1.4, context.tileSize * 0.12);
    const lintelHeight = Math.max(context.wallThickness * 1.5, context.wallHeight * 0.14);
    const sideHeight = context.wallHeight;
    const local = merge(
      transform(box(frameWidth, sideHeight, context.wallThickness * 1.8), {
        translate: vec3(-(clearWidth + frameWidth) * 0.5, sideHeight * 0.5, 0),
      }),
      transform(box(frameWidth, sideHeight, context.wallThickness * 1.8), {
        translate: vec3((clearWidth + frameWidth) * 0.5, sideHeight * 0.5, 0),
      }),
      transform(box(clearWidth + frameWidth * 2, lintelHeight, context.wallThickness * 1.8), {
        translate: vec3(0, sideHeight - lintelHeight * 0.5, 0),
      }),
    );
    return transform(local, {
      rotate: vec3(0, marker.rotationY, 0),
      translate: vec3(centerX, 0, centerZ),
    });
  }
  const radius = context.tileSize * 0.28;
  return transform(cylinder(radius, context.floorThickness * 1.8, 24), {
    translate: vec3(centerX, context.floorThickness * 0.45, centerZ),
  });
}

function mutableCellAt(
  cells: readonly MutableCell[],
  width: number,
  depth: number,
  x: number,
  z: number,
): MutableCell | undefined {
  if (x < 0 || z < 0 || x >= width || z >= depth) return undefined;
  return cells[z * width + x];
}

function toReadonlyCell(cell: MutableCell): DungeonCell {
  const result: { x: number; z: number; type: DungeonCellType; roomId?: number } = {
    x: cell.x,
    z: cell.z,
    type: cell.type,
  };
  if (cell.roomId !== undefined) result.roomId = cell.roomId;
  return result;
}

function edgeKey(roomA: number, roomB: number): string {
  return roomA < roomB ? `${roomA}:${roomB}` : `${roomB}:${roomA}`;
}

function boundaryKey(x1: number, z1: number, x2: number, z2: number): string {
  return x1 < x2 || (x1 === x2 && z1 < z2)
    ? `${x1},${z1}:${x2},${z2}`
    : `${x2},${z2}:${x1},${z1}`;
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
