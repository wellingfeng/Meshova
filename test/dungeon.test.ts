import { describe, expect, it } from "vitest";
import {
  buildDungeonArchitect,
  buildGridDungeonLayout,
  dungeonCellAt,
  dungeonRoomGraph,
  merge,
  triangleCount,
} from "../src/index.js";

describe("grid dungeon architect", () => {
  it("builds a connected deterministic room graph", () => {
    const config = { width: 30, depth: 22, roomCount: 10, seed: 42 };
    const a = buildGridDungeonLayout(config);
    const b = buildGridDungeonLayout(config);

    expect(a).toEqual(b);
    expect(a.rooms.length).toBeGreaterThanOrEqual(2);
    expect(a.connections.length).toBeGreaterThanOrEqual(a.rooms.length - 1);

    const graph = dungeonRoomGraph(a);
    const visited = new Set<number>([a.entryRoomId]);
    const queue = [a.entryRoomId];
    for (let index = 0; index < queue.length; index++) {
      for (const next of graph.get(queue[index]!) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    expect(visited.size).toBe(a.rooms.length);
    expect(visited.has(a.exitRoomId)).toBe(true);
  });

  it("emits semantic floor, wall, door and endpoint markers", () => {
    const layout = buildGridDungeonLayout({ width: 32, depth: 24, roomCount: 11, seed: 7 });
    const types = new Set(layout.markers.map((marker) => marker.type));
    expect(types).toEqual(new Set(["roomFloor", "corridorFloor", "wall", "door", "entry", "exit"]));
    expect(layout.markers.filter((marker) => marker.type === "entry")).toHaveLength(1);
    expect(layout.markers.filter((marker) => marker.type === "exit")).toHaveLength(1);

    for (const room of layout.rooms) {
      expect(dungeonCellAt(layout, room.center.x, room.center.z)?.roomId).toBe(room.id);
    }
  });

  it("adds deterministic loops without disconnecting the MST", () => {
    const tree = buildGridDungeonLayout({ width: 36, depth: 26, roomCount: 13, loopChance: 0, seed: 19 });
    const looped = buildGridDungeonLayout({ width: 36, depth: 26, roomCount: 13, loopChance: 0.7, seed: 19 });
    expect(tree.connections).toHaveLength(tree.rooms.length - 1);
    expect(looped.connections.length).toBeGreaterThan(tree.connections.length);
    expect(looped.connections.some((connection) => connection.loop)).toBe(true);
  });

  it("applies swappable themes to valid render parts", () => {
    const stone = buildDungeonArchitect({ width: 26, depth: 20, roomCount: 8, theme: "stone", seed: 5 });
    const tech = buildDungeonArchitect({ width: 26, depth: 20, roomCount: 8, theme: "tech", seed: 5 });
    expect(stone.layout.cells).toEqual(tech.layout.cells);
    expect(stone.parts.map((part) => part.name)).toContain("dungeon_walls");
    expect(tech.parts.map((part) => part.name)).toContain("tech_walls");

    for (const part of tech.parts) {
      expect(part.label).not.toMatch(/^component_|^root\./);
      expect(triangleCount(part.mesh)).toBeGreaterThan(0);
    }
    expect(merge(...tech.parts.map((part) => part.mesh)).positions.every((point) => (
      Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
    ))).toBe(true);
  });
});
