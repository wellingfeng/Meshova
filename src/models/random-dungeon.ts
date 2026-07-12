import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cylinder,
  merge,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

export interface RandomDungeonParams {
  readonly roomCount: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly corridorWidth: number;
  readonly branchiness: number;
  readonly loopChance: number;
  readonly cellSize: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly floorThickness: number;
  readonly seed: number;
}

export interface RandomDungeonRoom {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly centerX: number;
  readonly centerZ: number;
}

export interface RandomDungeonConnection {
  readonly from: number;
  readonly to: number;
  readonly loop: boolean;
  readonly horizontalFirst: boolean;
}

export interface RandomDungeonLayout {
  readonly rooms: readonly RandomDungeonRoom[];
  readonly connections: readonly RandomDungeonConnection[];
  readonly floorCells: ReadonlyArray<readonly [number, number]>;
  readonly entryRoom: number;
  readonly exitRoom: number;
}

export interface RandomDungeonSummary {
  readonly roomCount: number;
  readonly corridorCount: number;
  readonly loopCount: number;
  readonly floorCellCount: number;
  readonly entryRoom: number;
  readonly exitRoom: number;
}

export interface RandomDungeon {
  readonly layout: RandomDungeonLayout;
  readonly parts: NamedPart[];
  readonly summary: RandomDungeonSummary;
}

export const RANDOM_DUNGEON_DEFAULTS: RandomDungeonParams = {
  roomCount: 18,
  minRoomSize: 4,
  maxRoomSize: 8,
  corridorWidth: 2,
  branchiness: 0.62,
  loopChance: 0.18,
  cellSize: 0.72,
  wallHeight: 0.72,
  wallThickness: 0.12,
  floorThickness: 0.08,
  seed: 147,
};

interface ResolvedDungeonParams extends RandomDungeonParams {
  readonly roomCount: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly corridorWidth: number;
}

const FLOOR_COLOR: [number, number, number] = [0.36, 0.4, 0.41];
const WALL_COLOR: [number, number, number] = [0.72, 0.76, 0.77];
const ENTRY_COLOR: [number, number, number] = [0.12, 0.42, 0.92];
const EXIT_COLOR: [number, number, number] = [0.96, 0.12, 0.08];
const WAYPOINT_COLOR: [number, number, number] = [0.92, 0.68, 0.18];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveParams(params: Partial<RandomDungeonParams>): ResolvedDungeonParams {
  const merged = { ...RANDOM_DUNGEON_DEFAULTS, ...params };
  const minRoomSize = clamp(Math.round(merged.minRoomSize), 3, 12);
  return {
    ...merged,
    roomCount: clamp(Math.round(merged.roomCount), 2, 64),
    minRoomSize,
    maxRoomSize: clamp(Math.round(merged.maxRoomSize), minRoomSize, 16),
    corridorWidth: clamp(Math.round(merged.corridorWidth), 1, 4),
    branchiness: clamp(merged.branchiness, 0, 1),
    loopChance: clamp(merged.loopChance, 0, 1),
    cellSize: Math.max(0.1, merged.cellSize),
    wallHeight: Math.max(0.08, merged.wallHeight),
    wallThickness: Math.max(0.02, merged.wallThickness),
    floorThickness: Math.max(0.02, merged.floorThickness),
    seed: Math.round(merged.seed),
  };
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

function intersectsRoom(candidate: RandomDungeonRoom, room: RandomDungeonRoom, padding = 1): boolean {
  return candidate.x < room.x + room.width + padding
    && candidate.x + candidate.width + padding > room.x
    && candidate.z < room.z + room.depth + padding
    && candidate.z + candidate.depth + padding > room.z;
}

function makeRoom(id: number, x: number, z: number, width: number, depth: number): RandomDungeonRoom {
  return {
    id,
    x,
    z,
    width,
    depth,
    centerX: x + Math.floor(width / 2),
    centerZ: z + Math.floor(depth / 2),
  };
}

function chooseAnchor(rooms: readonly RandomDungeonRoom[], branchiness: number, rng: Rng, attempt: number): number {
  if (attempt > 80 || rng.next() < branchiness) return rng.int(0, rooms.length - 1);
  const recentSpan = Math.min(3, rooms.length);
  return rooms.length - 1 - rng.int(0, recentSpan - 1);
}

function candidateFromAnchor(
  id: number,
  anchor: RandomDungeonRoom,
  width: number,
  depth: number,
  direction: number,
  gap: number,
  lateral: number,
): RandomDungeonRoom {
  if (direction === 0) {
    return makeRoom(id, anchor.x + anchor.width + gap, Math.round(anchor.centerZ - depth / 2 + lateral), width, depth);
  }
  if (direction === 1) {
    return makeRoom(id, anchor.x - width - gap, Math.round(anchor.centerZ - depth / 2 + lateral), width, depth);
  }
  if (direction === 2) {
    return makeRoom(id, Math.round(anchor.centerX - width / 2 + lateral), anchor.z + anchor.depth + gap, width, depth);
  }
  return makeRoom(id, Math.round(anchor.centerX - width / 2 + lateral), anchor.z - depth - gap, width, depth);
}

function fallbackRoom(id: number, rooms: readonly RandomDungeonRoom[], p: ResolvedDungeonParams, rng: Rng): { room: RandomDungeonRoom; anchor: number } {
  const right = Math.max(...rooms.map((room) => room.x + room.width));
  const anchor = rooms.reduce((best, room, index) => Math.abs(room.centerZ) < Math.abs(rooms[best]!.centerZ) ? index : best, 0);
  const width = rng.int(p.minRoomSize, p.maxRoomSize);
  const depth = rng.int(p.minRoomSize, p.maxRoomSize);
  return {
    room: makeRoom(id, right + rng.int(3, 6), Math.round(rooms[anchor]!.centerZ - depth / 2), width, depth),
    anchor,
  };
}

function addTreeRooms(p: ResolvedDungeonParams, rng: Rng): { rooms: RandomDungeonRoom[]; connections: RandomDungeonConnection[] } {
  const firstWidth = rng.int(p.minRoomSize, p.maxRoomSize);
  const firstDepth = rng.int(p.minRoomSize, p.maxRoomSize);
  const rooms: RandomDungeonRoom[] = [makeRoom(0, -Math.floor(firstWidth / 2), -Math.floor(firstDepth / 2), firstWidth, firstDepth)];
  const connections: RandomDungeonConnection[] = [];

  for (let id = 1; id < p.roomCount; id++) {
    let placed: RandomDungeonRoom | undefined;
    let anchorIndex = 0;
    for (let attempt = 0; attempt < 220; attempt++) {
      anchorIndex = chooseAnchor(rooms, p.branchiness, rng, attempt);
      const anchor = rooms[anchorIndex]!;
      const width = rng.int(p.minRoomSize, p.maxRoomSize);
      const depth = rng.int(p.minRoomSize, p.maxRoomSize);
      const direction = rng.int(0, 3);
      const gap = rng.int(3, 7);
      const lateralSpan = direction < 2 ? Math.max(1, Math.floor(anchor.depth * 0.45)) : Math.max(1, Math.floor(anchor.width * 0.45));
      const candidate = candidateFromAnchor(id, anchor, width, depth, direction, gap, rng.int(-lateralSpan, lateralSpan));
      if (!rooms.some((room) => intersectsRoom(candidate, room))) {
        placed = candidate;
        break;
      }
    }
    if (!placed) {
      const fallback = fallbackRoom(id, rooms, p, rng);
      placed = fallback.room;
      anchorIndex = fallback.anchor;
    }
    rooms.push(placed);
    connections.push({ from: anchorIndex, to: id, loop: false, horizontalFirst: rng.next() < 0.5 });
  }
  return { rooms, connections };
}

function addLoopConnections(rooms: readonly RandomDungeonRoom[], connections: RandomDungeonConnection[], chance: number, rng: Rng): void {
  const target = Math.round((rooms.length - 1) * chance * 0.55);
  if (target === 0) return;
  const connected = new Set(connections.map((edge) => `${Math.min(edge.from, edge.to)}:${Math.max(edge.from, edge.to)}`));
  const candidates: Array<{ from: number; to: number; score: number }> = [];
  for (let from = 0; from < rooms.length; from++) {
    for (let to = from + 1; to < rooms.length; to++) {
      if (connected.has(`${from}:${to}`)) continue;
      const a = rooms[from]!;
      const b = rooms[to]!;
      const distance = Math.abs(a.centerX - b.centerX) + Math.abs(a.centerZ - b.centerZ);
      candidates.push({ from, to, score: distance + rng.range(0, 6) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.from - b.from || a.to - b.to);
  for (const candidate of candidates.slice(0, target)) {
    connections.push({
      from: candidate.from,
      to: candidate.to,
      loop: true,
      horizontalFirst: rng.next() < 0.5,
    });
  }
}

function carveSquare(cells: Set<string>, x: number, z: number, width: number): void {
  const low = -Math.floor((width - 1) / 2);
  const high = Math.ceil((width - 1) / 2);
  for (let dz = low; dz <= high; dz++) {
    for (let dx = low; dx <= high; dx++) cells.add(cellKey(x + dx, z + dz));
  }
}

function carveHorizontal(cells: Set<string>, fromX: number, toX: number, z: number, width: number): void {
  const start = Math.min(fromX, toX);
  const end = Math.max(fromX, toX);
  for (let x = start; x <= end; x++) carveSquare(cells, x, z, width);
}

function carveVertical(cells: Set<string>, x: number, fromZ: number, toZ: number, width: number): void {
  const start = Math.min(fromZ, toZ);
  const end = Math.max(fromZ, toZ);
  for (let z = start; z <= end; z++) carveSquare(cells, x, z, width);
}

function carveConnection(cells: Set<string>, a: RandomDungeonRoom, b: RandomDungeonRoom, width: number, horizontalFirst: boolean): void {
  if (horizontalFirst) {
    carveHorizontal(cells, a.centerX, b.centerX, a.centerZ, width);
    carveVertical(cells, b.centerX, a.centerZ, b.centerZ, width);
  } else {
    carveVertical(cells, a.centerX, a.centerZ, b.centerZ, width);
    carveHorizontal(cells, a.centerX, b.centerX, b.centerZ, width);
  }
}

function carveLayout(rooms: readonly RandomDungeonRoom[], connections: readonly RandomDungeonConnection[], corridorWidth: number): ReadonlyArray<readonly [number, number]> {
  const cells = new Set<string>();
  for (const room of rooms) {
    for (let z = room.z; z < room.z + room.depth; z++) {
      for (let x = room.x; x < room.x + room.width; x++) cells.add(cellKey(x, z));
    }
  }
  for (const edge of connections) {
    carveConnection(cells, rooms[edge.from]!, rooms[edge.to]!, corridorWidth, edge.horizontalFirst);
  }
  return [...cells]
    .map((key) => key.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function farthestRoom(start: number, roomCount: number, connections: readonly RandomDungeonConnection[]): number {
  const neighbors = Array.from({ length: roomCount }, () => [] as number[]);
  for (const edge of connections) {
    neighbors[edge.from]!.push(edge.to);
    neighbors[edge.to]!.push(edge.from);
  }
  const distance = Array.from({ length: roomCount }, () => -1);
  distance[start] = 0;
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    for (const next of neighbors[current]!) {
      if (distance[next] !== -1) continue;
      distance[next] = distance[current]! + 1;
      queue.push(next);
    }
  }
  let farthest = start;
  for (let i = 0; i < distance.length; i++) {
    if (distance[i]! > distance[farthest]!) farthest = i;
  }
  return farthest;
}

export function generateRandomDungeonLayout(params: Partial<RandomDungeonParams> = {}): RandomDungeonLayout {
  const p = resolveParams(params);
  const rng = makeRng(p.seed);
  const { rooms, connections } = addTreeRooms(p, rng);
  addLoopConnections(rooms, connections, p.loopChance, rng);
  const entryRoom = farthestRoom(0, rooms.length, connections);
  const exitRoom = farthestRoom(entryRoom, rooms.length, connections);
  return {
    rooms,
    connections,
    floorCells: carveLayout(rooms, connections, p.corridorWidth),
    entryRoom,
    exitRoom,
  };
}

function layoutOffset(layout: RandomDungeonLayout, cellSize: number): { x: number; z: number } {
  const xs = layout.floorCells.map((cell) => cell[0]);
  const zs = layout.floorCells.map((cell) => cell[1]);
  return {
    x: -(Math.min(...xs) + Math.max(...xs)) * cellSize * 0.5,
    z: -(Math.min(...zs) + Math.max(...zs)) * cellSize * 0.5,
  };
}

function cellWorld(x: number, z: number, cellSize: number, offset: { x: number; z: number }): { x: number; z: number } {
  return { x: x * cellSize + offset.x, z: z * cellSize + offset.z };
}

function makeFloorMeshes(layout: RandomDungeonLayout, p: ResolvedDungeonParams, offset: { x: number; z: number }): Mesh[] {
  return layout.floorCells.map(([x, z]) => {
    const world = cellWorld(x, z, p.cellSize, offset);
    return transform(box(p.cellSize, p.floorThickness, p.cellSize), {
      translate: vec3(world.x, p.floorThickness * 0.5, world.z),
    });
  });
}

function makeWallMeshes(layout: RandomDungeonLayout, p: ResolvedDungeonParams, offset: { x: number; z: number }): Mesh[] {
  const occupied = new Set(layout.floorCells.map(([x, z]) => cellKey(x, z)));
  const walls: Mesh[] = [];
  for (const [x, z] of layout.floorCells) {
    const world = cellWorld(x, z, p.cellSize, offset);
    const y = p.floorThickness + p.wallHeight * 0.5;
    if (!occupied.has(cellKey(x + 1, z))) {
      walls.push(transform(box(p.wallThickness, p.wallHeight, p.cellSize + p.wallThickness), {
        translate: vec3(world.x + p.cellSize * 0.5, y, world.z),
      }));
    }
    if (!occupied.has(cellKey(x - 1, z))) {
      walls.push(transform(box(p.wallThickness, p.wallHeight, p.cellSize + p.wallThickness), {
        translate: vec3(world.x - p.cellSize * 0.5, y, world.z),
      }));
    }
    if (!occupied.has(cellKey(x, z + 1))) {
      walls.push(transform(box(p.cellSize + p.wallThickness, p.wallHeight, p.wallThickness), {
        translate: vec3(world.x, y, world.z + p.cellSize * 0.5),
      }));
    }
    if (!occupied.has(cellKey(x, z - 1))) {
      walls.push(transform(box(p.cellSize + p.wallThickness, p.wallHeight, p.wallThickness), {
        translate: vec3(world.x, y, world.z - p.cellSize * 0.5),
      }));
    }
  }
  return walls;
}

function markerMesh(room: RandomDungeonRoom, p: ResolvedDungeonParams, offset: { x: number; z: number }, height: number): Mesh {
  const world = cellWorld(room.centerX, room.centerZ, p.cellSize, offset);
  const size = Math.min(room.width, room.depth) * p.cellSize * 0.48;
  return transform(box(size, height, size), {
    translate: vec3(world.x, p.floorThickness + height * 0.5 + 0.006, world.z),
  });
}

function waypointMeshes(layout: RandomDungeonLayout, p: ResolvedDungeonParams, offset: { x: number; z: number }): Mesh[] {
  return layout.rooms
    .filter((room) => room.id !== layout.entryRoom && room.id !== layout.exitRoom)
    .map((room) => {
      const world = cellWorld(room.centerX, room.centerZ, p.cellSize, offset);
      return transform(cylinder(p.cellSize * 0.11, p.floorThickness * 0.8, 12, true), {
        translate: vec3(world.x, p.floorThickness * 1.4, world.z),
      });
    });
}

export function buildRandomDungeon(params: Partial<RandomDungeonParams> = {}): RandomDungeon {
  const p = resolveParams(params);
  const layout = generateRandomDungeonLayout(p);
  const offset = layoutOffset(layout, p.cellSize);
  const loopCount = layout.connections.filter((edge) => edge.loop).length;
  const metadata = {
    rooms: layout.rooms.length,
    corridors: layout.connections.length,
    loops: loopCount,
    floorCells: layout.floorCells.length,
    seed: p.seed,
    method: "seeded room growth + orthogonal corridors + occupancy boundary walls",
  };
  const parts: NamedPart[] = [
    {
      name: "dungeon_floors",
      label: "房间与走廊地面",
      mesh: merge(...makeFloorMeshes(layout, p, offset)),
      color: FLOOR_COLOR,
      surface: { type: "stone", params: { color: FLOOR_COLOR, roughness: 0.88, seed: p.seed } },
      metadata,
    },
    {
      name: "dungeon_walls",
      label: "地牢边界墙",
      mesh: merge(...makeWallMeshes(layout, p, offset)),
      color: WALL_COLOR,
      surface: { type: "stone", params: { color: WALL_COLOR, roughness: 0.8, seed: p.seed + 1 } },
      metadata,
    },
    {
      name: "dungeon_entry",
      label: "入口",
      mesh: markerMesh(layout.rooms[layout.entryRoom]!, p, offset, p.floorThickness * 0.45),
      color: ENTRY_COLOR,
      surface: { type: "emissive", params: { color: ENTRY_COLOR, intensity: 0.65, seed: p.seed + 2 } },
    },
    {
      name: "dungeon_exit",
      label: "出口",
      mesh: markerMesh(layout.rooms[layout.exitRoom]!, p, offset, p.floorThickness * 0.45),
      color: EXIT_COLOR,
      surface: { type: "emissive", params: { color: EXIT_COLOR, intensity: 0.8, seed: p.seed + 3 } },
    },
    {
      name: "dungeon_waypoints",
      label: "房间节点标记",
      mesh: merge(...waypointMeshes(layout, p, offset)),
      color: WAYPOINT_COLOR,
      surface: { type: "metal", params: { color: WAYPOINT_COLOR, roughness: 0.35, metallic: 0.65, seed: p.seed + 4 } },
    },
  ];
  return {
    layout,
    parts,
    summary: {
      roomCount: layout.rooms.length,
      corridorCount: layout.connections.length,
      loopCount,
      floorCellCount: layout.floorCells.length,
      entryRoom: layout.entryRoom,
      exitRoom: layout.exitRoom,
    },
  };
}

export function buildRandomDungeonParts(params: Partial<RandomDungeonParams> = {}): NamedPart[] {
  return buildRandomDungeon(params).parts;
}
