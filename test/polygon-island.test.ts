import { describe, expect, it } from "vitest";
import {
  buildIslandGraph,
  buildPolygonIslandParts,
  islandGraphToMesh,
  triangleCount,
  vec3,
  vertexCount,
} from "../src/index.js";

describe("polygon island generator", () => {
  it("is deterministic for a given seed", () => {
    const a = buildIslandGraph({ seed: 3, points: 400 });
    const b = buildIslandGraph({ seed: 3, points: 400 });
    expect(a.cells.length).toBe(b.cells.length);
    expect(a.triangles).toEqual(b.triangles);
    expect(a.cells.map((c) => c.biome)).toEqual(b.cells.map((c) => c.biome));
    expect(a.cells.map((c) => c.elevation)).toEqual(b.cells.map((c) => c.elevation));
  });

  it("different seeds produce different islands", () => {
    const a = buildIslandGraph({ seed: 1, points: 400 });
    const b = buildIslandGraph({ seed: 2, points: 400 });
    expect(a.cells.map((c) => c.biome)).not.toEqual(b.cells.map((c) => c.biome));
  });

  it("classifies both ocean and land cells", () => {
    const g = buildIslandGraph({ seed: 5, points: 600 });
    const ocean = g.cells.filter((c) => c.ocean).length;
    const land = g.cells.filter((c) => !c.water).length;
    expect(ocean).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });

  it("keeps land elevation in [0,1] and ocean below zero", () => {
    const g = buildIslandGraph({ seed: 8, points: 500 });
    for (const c of g.cells) {
      if (c.ocean) expect(c.elevation).toBeLessThanOrEqual(0);
      else expect(c.elevation).toBeGreaterThanOrEqual(0);
      expect(c.elevation).toBeLessThanOrEqual(1.0001);
    }
  });

  it("builds a valid triangle mesh with per-vertex colors", () => {
    const g = buildIslandGraph({ seed: 4, points: 500 });
    const { mesh, colors } = islandGraphToMesh(g);
    expect(vertexCount(mesh)).toBe(g.cells.length);
    expect(colors.length).toBe(g.cells.length * 3);
    expect(triangleCount(mesh)).toBeGreaterThan(0);
    expect(mesh.indices.every((i) => i >= 0 && i < g.cells.length)).toBe(true);
  });

  it("emits island, ocean and (usually) river parts with matched surfaces", () => {
    const parts = buildPolygonIslandParts({ seed: 6, points: 800, rivers: 10 });
    const names = parts.map((p) => p.name);
    expect(names).toContain("island");
    expect(names).toContain("ocean");
    expect(parts.find((p) => p.name === "island")!.surface?.type).toBe("mossyStone");
    expect(parts.find((p) => p.name === "ocean")!.surface?.type).toBe("water");
  });

  it("uses an editable region as the coastline boundary", () => {
    const graph = buildIslandGraph({
      seed: 4,
      points: 625,
      boundary: [
        vec3(-5, 0, -4),
        vec3(0, 0, -4),
        vec3(0, 0, 4),
        vec3(-5, 0, 4),
      ],
    });
    const land = graph.cells.filter((cell) => !cell.water);
    expect(land.length).toBeGreaterThan(20);
    expect(land.every((cell) => cell.site.x <= 0 && cell.site.x >= -5)).toBe(true);
    expect(land.every((cell) => cell.site.y <= 4 && cell.site.y >= -4)).toBe(true);
  });
});
