import { describe, expect, it } from "vitest";
import {
  buildRandomDungeon,
  generateRandomDungeonLayout,
  triangleCount,
} from "../src/index.js";

function reachableRoomCount(roomCount: number, connections: ReadonlyArray<{ from: number; to: number }>): number {
  const neighbors = Array.from({ length: roomCount }, () => [] as number[]);
  for (const edge of connections) {
    neighbors[edge.from]!.push(edge.to);
    neighbors[edge.to]!.push(edge.from);
  }
  const visited = new Set([0]);
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of neighbors[queue[cursor]!]!) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited.size;
}

describe("random dungeon", () => {
  it("generates a deterministic connected room graph", () => {
    const params = { roomCount: 20, branchiness: 0.7, loopChance: 0.3, seed: 147 };
    const first = generateRandomDungeonLayout(params);
    const second = generateRandomDungeonLayout(params);

    expect(first).toEqual(second);
    expect(first.rooms).toHaveLength(20);
    expect(first.connections.filter((edge) => !edge.loop)).toHaveLength(19);
    expect(reachableRoomCount(first.rooms.length, first.connections)).toBe(20);
    expect(first.entryRoom).not.toBe(first.exitRoom);
  });

  it("changes the footprint when the seed changes", () => {
    const first = generateRandomDungeonLayout({ roomCount: 16, seed: 10 });
    const second = generateRandomDungeonLayout({ roomCount: 16, seed: 11 });

    expect(first.rooms).not.toEqual(second.rooms);
    expect(first.floorCells).not.toEqual(second.floorCells);
  });

  it("builds floors, boundary walls and semantic markers", () => {
    const dungeon = buildRandomDungeon({ roomCount: 14, corridorWidth: 2, seed: 32 });

    expect(dungeon.parts.map((part) => part.name)).toEqual([
      "dungeon_floors",
      "dungeon_walls",
      "dungeon_entry",
      "dungeon_exit",
      "dungeon_waypoints",
    ]);
    expect(dungeon.summary.roomCount).toBe(14);
    expect(dungeon.summary.floorCellCount).toBeGreaterThan(14 * 9);
    expect(triangleCount(dungeon.parts[0]!.mesh)).toBeGreaterThan(0);
    expect(triangleCount(dungeon.parts[1]!.mesh)).toBeGreaterThan(0);
    expect(dungeon.parts.every((part) => part.mesh.positions.every((position) =>
      Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
    ))).toBe(true);
  });
});
