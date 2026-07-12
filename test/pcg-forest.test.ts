import { describe, expect, it } from "vitest";
import {
  buildPcgForestParts,
  summarizePcgForest,
} from "../src/models/pcg-forest.js";

describe("procedural PCG forest", () => {
  it("builds deterministic layered forest geometry", () => {
    const params = {
      size: 32,
      resolution: 32,
      candidates: 180,
      shrubs: 0.45,
      rocks: 0.25,
      deadwood: 0.2,
      seed: 17,
    };
    const first = buildPcgForestParts(params);
    const second = buildPcgForestParts(params);

    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
    expect(first.some((part) => part.name === "forest_path")).toBe(true);
    expect(first.some((part) => part.name.startsWith("canopy_"))).toBe(true);
    expect(first.every((part) => part.label && !part.label.includes("component_"))).toBe(true);
  });

  it("keeps the default scene practical for browser iteration", () => {
    const parts = buildPcgForestParts();
    const summary = summarizePcgForest(parts);

    expect(summary.treeCount).toBeGreaterThan(20);
    expect(summary.shrubCount).toBeGreaterThan(10);
    expect(summary.rockCount).toBeGreaterThan(0);
    expect(summary.deadwoodCount).toBeGreaterThan(0);
    expect(summary.triangleCount).toBeLessThan(500_000);
  });

  it("changes distribution with seed", () => {
    const first = buildPcgForestParts({ resolution: 24, candidates: 120, seed: 4 });
    const second = buildPcgForestParts({ resolution: 24, candidates: 120, seed: 5 });
    const firstTerrain = first.find((part) => part.name === "forest_terrain")!;
    const secondTerrain = second.find((part) => part.name === "forest_terrain")!;

    expect(firstTerrain.mesh.positions).not.toEqual(secondTerrain.mesh.positions);
  });
});
