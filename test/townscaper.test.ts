import { describe, expect, it } from "vitest";
import {
  bounds,
  buildTownscaperScene,
  merge,
  triangleCount,
} from "../src/index.js";

describe("Townscaper-inspired harbour", () => {
  it("derives a complete harbour from grid adjacency", () => {
    const town = buildTownscaperScene();
    const names = town.parts.map((part) => part.name);
    expect(names).toContain("townscaper_water");
    expect(names).toContain("townscaper_roofs");
    expect(names).toContain("townscaper_arch_trims");
    expect(names).toContain("townscaper_bridges");
    expect(names).toContain("townscaper_foundation_piers");
    expect(town.summary.occupiedCells).toBeGreaterThan(45);
    expect(town.summary.archCount).toBeGreaterThan(8);
    expect(town.summary.bridgeCount).toBeGreaterThan(0);
    expect(town.summary.windowCount).toBeGreaterThan(80);
    expect(town.parts.find((part) => part.name === "townscaper_water")?.surface?.type).toBe("water");
    expect(town.parts.every((part) => part.label && !part.label.includes("townscaper_"))).toBe(true);
  });

  it("is deterministic for equal parameters", () => {
    const params = { gridSize: 9, maxFloors: 4, seed: 93 };
    const first = buildTownscaperScene(params);
    const second = buildTownscaperScene(params);
    expect(first.summary).toEqual(second.summary);
    expect(first.parts.find((part) => part.name === "townscaper_roofs")?.mesh).toEqual(
      second.parts.find((part) => part.name === "townscaper_roofs")?.mesh,
    );
  });

  it("reacts to density and height parameters", () => {
    const sparse = buildTownscaperScene({ density: 0.35, maxFloors: 3, canalWidth: 1.1, seed: 17 });
    const dense = buildTownscaperScene({ density: 0.92, maxFloors: 8, canalWidth: 0.2, seed: 17 });
    expect(dense.summary.occupiedCells).toBeGreaterThan(sparse.summary.occupiedCells);
    expect(dense.summary.maxHeight).toBeGreaterThan(sparse.summary.maxHeight);
    const sparseBounds = bounds(merge(...sparse.parts.map((part) => part.mesh)));
    const denseBounds = bounds(merge(...dense.parts.map((part) => part.mesh)));
    expect(denseBounds.max.y).toBeGreaterThan(sparseBounds.max.y);
  });

  it("emits finite indexed geometry", () => {
    for (const part of buildTownscaperScene({ gridSize: 8, density: 0.55 }).parts) {
      expect(triangleCount(part.mesh), part.name).toBeGreaterThan(0);
      expect(part.mesh.positions.every((position) => Number.isFinite(position.x + position.y + position.z))).toBe(true);
    }
  });
});
