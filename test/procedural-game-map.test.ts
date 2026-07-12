import { describe, expect, it } from "vitest";
import {
  buildProceduralGameMap,
  critique,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

const SMALL_MAP = {
  size: 125,
  boundarySides: 10,
  boundaryJitter: 0.12,
  targetBlockArea: 620,
  minBlockArea: 160,
  streetWidth: 7,
  maxBuildings: 10,
  propDensity: 0.45,
  seed: 23,
};

function expectValidParts(parts: NamedPart[]): void {
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts) {
    expect(triangleCount(part.mesh), `${part.name} has triangles`).toBeGreaterThan(0);
    expect(part.mesh.positions.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
  }
}

describe("procedural game map", () => {
  it("builds road network, gameplay markers and semantic zones", () => {
    const map = buildProceduralGameMap(SMALL_MAP);
    expectValidParts(map.parts);

    const names = map.parts.map((p) => p.name);
    expect(names).toContain("ground_blocks");
    expect(names).toContain("road_asphalt");
    expect(names).toContain("road_markings");
    expect(names).toContain("map_boundary_walls");
    expect(names).toContain("control_point_pad");
    expect(names).toContain("spawn_a_pad");
    expect(names).toContain("spawn_b_pad");
    expect(names.some((n) => n.startsWith("zone_park_") || n.startsWith("park_"))).toBe(true);
    expect(names.some((n) => n.startsWith("gameplay_cover_"))).toBe(true);

    expect(map.summary.blockCount).toBeGreaterThan(4);
    expect(map.summary.streetCount).toBeGreaterThan(0);
    expect(map.summary.zoneCounts.plaza).toBe(1);
    expect(map.summary.zoneCounts.spawnA).toBe(1);
    expect(map.summary.zoneCounts.spawnB).toBe(1);
  });

  it("is deterministic for same seed and params", () => {
    const a = buildProceduralGameMap({ ...SMALL_MAP, seed: 77 });
    const b = buildProceduralGameMap({ ...SMALL_MAP, seed: 77 });
    expect(a.summary).toEqual(b.summary);
    expect(a.parts.map((p) => p.name)).toEqual(b.parts.map((p) => p.name));
    expect(merge(...a.parts.map((p) => p.mesh)).positions).toEqual(merge(...b.parts.map((p) => p.mesh)).positions);
  });

  it("passes deterministic geometry self-review", () => {
    const map = buildProceduralGameMap();
    const report = critique(map.parts, {
      goal: "live procedural gameplay map with roads, zones, spawns and cover",
    });
    expect(report.issues.filter((issue) => issue.severity === "hard")).toEqual([]);
  });
});
