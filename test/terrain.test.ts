import { describe, expect, it } from "vitest";
import {
  TERRAIN_ISLAND_DEFAULTS,
  bounds,
  buildTerrainIslandParts,
  merge,
  scoreTerrainIsland,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function merged(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("procedural terrain island", () => {
  it("builds terrain, water, river, cliffs and scatter with matched surfaces", () => {
    const parts = buildTerrainIslandParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("terrain");
    expect(names).toContain("water");
    expect(names).toContain("riverbed");
    expect(names).toContain("cliff_faces");
    expect(names).toContain("boulders");
    expect(names).toContain("tree_trunks");
    expect(names).toContain("tree_canopies");
    expect(parts.find((p) => p.name === "terrain")!.surface?.type).toBe("mossyStone");
    expect(parts.find((p) => p.name === "water")!.surface?.type).toBe("water");
    expect(parts.find((p) => p.name === "tree_canopies")!.surface?.type).toBe("leaf");
  });

  it("is deterministic for fixed params", () => {
    const params = { seed: 12, resolution: 24, rocks: 12, trees: 18 };
    const a = merged(buildTerrainIslandParts(params));
    const b = merged(buildTerrainIslandParts(params));
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("seed changes scatter placement without changing fixed grid topology", () => {
    const a = buildTerrainIslandParts({ seed: 1, resolution: 20, rocks: 16, trees: 0 }).find((p) => p.name === "boulders")!.mesh;
    const b = buildTerrainIslandParts({ seed: 99, resolution: 20, rocks: 16, trees: 0 }).find((p) => p.name === "boulders")!.mesh;
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(a.positions).not.toEqual(b.positions);
  });

  it("size controls terrain bounds", () => {
    const terrain = buildTerrainIslandParts({ size: 8, resolution: 16 }).find((p) => p.name === "terrain")!.mesh;
    const bb = bounds(terrain);
    expect(bb.max.x - bb.min.x).toBeCloseTo(8);
    expect(bb.max.z - bb.min.z).toBeCloseTo(8);
  });

  it("resolution controls terrain vertex count", () => {
    const low = buildTerrainIslandParts({ resolution: 12 }).find((p) => p.name === "terrain")!.mesh;
    const high = buildTerrainIslandParts({ resolution: 28 }).find((p) => p.name === "terrain")!.mesh;
    expect(vertexCount(high)).toBeGreaterThan(vertexCount(low));
  });

  it("height controls relief", () => {
    const low = bounds(buildTerrainIslandParts({ height: 0.7, resolution: 20 }).find((p) => p.name === "terrain")!.mesh);
    const high = bounds(buildTerrainIslandParts({ height: 2.8, resolution: 20 }).find((p) => p.name === "terrain")!.mesh);
    expect(high.max.y - high.min.y).toBeGreaterThan(low.max.y - low.min.y);
  });

  it("river width controls riverbed mesh span", () => {
    const narrow = bounds(buildTerrainIslandParts({ riverWidth: 0.18 }).find((p) => p.name === "riverbed")!.mesh);
    const wide = bounds(buildTerrainIslandParts({ riverWidth: 0.8 }).find((p) => p.name === "riverbed")!.mesh);
    expect(wide.max.x - wide.min.x).toBeGreaterThan(narrow.max.x - narrow.min.x);
  });

  it("rock and tree counts control scatter geometry", () => {
    const sparse = buildTerrainIslandParts({ rocks: 4, trees: 8 });
    const dense = buildTerrainIslandParts({ rocks: 40, trees: 80 });
    expect(vertexCount(dense.find((p) => p.name === "boulders")!.mesh)).toBeGreaterThan(
      vertexCount(sparse.find((p) => p.name === "boulders")!.mesh),
    );
    expect(vertexCount(dense.find((p) => p.name === "tree_canopies")!.mesh)).toBeGreaterThan(
      vertexCount(sparse.find((p) => p.name === "tree_canopies")!.mesh),
    );
  });

  it("scores a complete island higher than terrain-only", () => {
    const full = buildTerrainIslandParts();
    const terrainOnly = full.filter((p) => p.name === "terrain");
    const fullScore = scoreTerrainIsland(full);
    const sparseScore = scoreTerrainIsland(terrainOnly);
    expect(fullScore.score).toBeGreaterThan(0.75);
    expect(fullScore.score).toBeGreaterThan(sparseScore.score);
    expect(fullScore.metrics.hydrology).toBe(1);
  });

  it("exposes sane defaults", () => {
    expect(TERRAIN_ISLAND_DEFAULTS.size).toBeGreaterThan(0);
    expect(TERRAIN_ISLAND_DEFAULTS.resolution).toBeGreaterThan(0);
    expect(TERRAIN_ISLAND_DEFAULTS.rocks).toBeGreaterThan(0);
  });
});
