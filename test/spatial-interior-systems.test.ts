import { describe, expect, it } from "vitest";
import {
  ROOM_SHELL_MODELS,
  STORAGE_WALL_MODELS,
  buildRoomShellParts,
  buildRoomShellPresetParts,
  buildStorageRoomSuiteParts,
  buildStorageWallParts,
  type RoomOpening,
} from "../src/models/spatial-interior-systems.js";
import {
  bounds,
  merge,
  triangleCount,
  type Mesh,
} from "../src/geometry/index.js";

function triangleCentroids(mesh: Mesh): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const first = mesh.positions[mesh.indices[index]!]!;
    const second = mesh.positions[mesh.indices[index + 1]!]!;
    const third = mesh.positions[mesh.indices[index + 2]!]!;
    result.push([
      (first.x + second.x + third.x) / 3,
      (first.y + second.y + third.y) / 3,
      (first.z + second.z + third.z) / 3,
    ]);
  }
  return result;
}

describe("spatial interior systems", () => {
  it("registers independent room and storage families", () => {
    expect(ROOM_SHELL_MODELS).toHaveLength(3);
    expect(STORAGE_WALL_MODELS).toHaveLength(3);
    expect(new Set([...ROOM_SHELL_MODELS, ...STORAGE_WALL_MODELS].map((entry) => entry.id)).size).toBe(6);
  });

  it.each(ROOM_SHELL_MODELS)("builds valid semantic room shell for $name", (definition) => {
    const parts = buildRoomShellPresetParts(definition.defaults);
    const mesh = merge(...parts.map((entry) => entry.mesh));
    expect(parts.some((entry) => entry.name === "room_walls")).toBe(true);
    expect(parts.some((entry) => entry.name === "opening_frames")).toBe(true);
    expect(parts.every((entry) => entry.label && !/^component_|^root\./.test(entry.label))).toBe(true);
    expect(parts.every((entry) => Array.isArray(entry.metadata?.anchors))).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(80);
    expect(mesh.indices.every((value) => value >= 0 && value < mesh.positions.length)).toBe(true);
  });

  it("cuts real wall geometry around door and window openings", () => {
    const openings: RoomOpening[] = [
      { id: "door", kind: "door", wall: "back", center: -1.5, width: 1, height: 2.2, sill: 0, openness: 0 },
      { id: "window", kind: "window", wall: "back", center: 1.2, width: 1.5, height: 1.2, sill: 0.9, openness: 0 },
    ];
    const parts = buildRoomShellParts({ width: 6, depth: 4.5, height: 2.8 }, openings);
    const walls = parts.find((entry) => entry.name === "room_walls")!.mesh;
    const centroids = triangleCentroids(walls);
    const doorInteriorFaces = centroids.filter(([centerX, centerY, centerZ]) => (
      Math.abs(centerX + 1.5) < 0.32 && centerY > 0.18 && centerY < 2.02 && Math.abs(centerZ + 2.25) < 0.12
    ));
    const windowInteriorFaces = centroids.filter(([centerX, centerY, centerZ]) => (
      Math.abs(centerX - 1.2) < 0.48 && centerY > 1.05 && centerY < 1.92 && Math.abs(centerZ + 2.25) < 0.12
    ));
    expect(doorInteriorFaces).toHaveLength(0);
    expect(windowInteriorFaces).toHaveLength(0);
  });

  it("links room dimensions, opening state and LOD to geometry", () => {
    const compact = merge(...buildRoomShellPresetParts({ kind: "entry-window-room", width: 4.5 }).map((entry) => entry.mesh));
    const wide = merge(...buildRoomShellPresetParts({ kind: "entry-window-room", width: 9 }).map((entry) => entry.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(compact).max.x - bounds(compact).min.x);

    const closed = buildRoomShellPresetParts({ kind: "entry-window-room", openness: 0 });
    const open = buildRoomShellPresetParts({ kind: "entry-window-room", openness: 1 });
    expect(open.find((entry) => entry.name === "door_leaves")!.mesh.positions)
      .not.toEqual(closed.find((entry) => entry.name === "door_leaves")!.mesh.positions);

    const preview = buildRoomShellPresetParts({ kind: "entry-window-room", detail: 0 });
    expect(preview.some((entry) => entry.name === "room_baseboards")).toBe(false);
  });

  it.each(STORAGE_WALL_MODELS)("builds configurable storage wall for $name", (definition) => {
    const parts = buildStorageWallParts(definition.defaults);
    const mesh = merge(...parts.map((entry) => entry.mesh));
    expect(parts.some((entry) => entry.name === "storage_carcass")).toBe(true);
    expect(parts.some((entry) => entry.name === "storage_dividers")).toBe(true);
    expect(parts.some((entry) => entry.name === "storage_shelves")).toBe(true);
    expect(parts.every((entry) => Array.isArray(entry.metadata?.anchors))).toBe(true);
    expect(parts.every((entry) => typeof entry.metadata?.materialSlot === "string")).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(50);
  });

  it("reflows bays, shelves, doors and drawers deterministically", () => {
    const options = { kind: "wardrobe-wall", bays: 6, shelves: 4, drawers: 3, openness: 0.6 } as const;
    const first = buildStorageWallParts(options);
    const second = buildStorageWallParts(options);
    expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));

    const fewBays = buildStorageWallParts({ kind: "bookcase-wall", bays: 3, shelves: 2 });
    const manyBays = buildStorageWallParts({ kind: "bookcase-wall", bays: 7, shelves: 6 });
    expect(manyBays.find((entry) => entry.name === "storage_dividers")!.mesh.positions.length)
      .toBeGreaterThan(fewBays.find((entry) => entry.name === "storage_dividers")!.mesh.positions.length);
    expect(manyBays.find((entry) => entry.name === "storage_shelves")!.mesh.positions.length)
      .toBeGreaterThan(fewBays.find((entry) => entry.name === "storage_shelves")!.mesh.positions.length);
  });

  it("builds integrated room and storage suite", () => {
    const parts = buildStorageRoomSuiteParts({ width: 7.4, depth: 5.6, bays: 6, detail: 1 });
    const mesh = merge(...parts.map((entry) => entry.mesh));
    const storageParts = parts.filter((entry) => entry.metadata?.assemblyRole === "整墙收纳");
    const roomPart = parts.find((entry) => entry.name === "storage_room_room_walls")!;
    const openings = roomPart.metadata?.openings as RoomOpening[];
    const door = openings.find((opening) => opening.kind === "door")!;
    const storageBounds = bounds(merge(...storageParts.map((entry) => entry.mesh)));
    expect(parts.some((entry) => entry.metadata?.assemblyRole === "房间壳体")).toBe(true);
    expect(parts.some((entry) => entry.metadata?.assemblyRole === "整墙收纳")).toBe(true);
    expect(parts.every((entry) => entry.metadata?.assembly === "storage-room-suite")).toBe(true);
    expect(door.center + door.width * 0.5).toBeLessThan(storageBounds.min.x);
    expect(storageParts.every((entry) => Array.isArray(entry.metadata?.anchors))).toBe(true);
    expect(storageParts.flatMap((entry) => entry.metadata?.anchors as Array<{ position: number[] }>)
      .every((anchor) => anchor.position.every(Number.isFinite))).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(180);
  });
});
