import { describe, expect, it } from "vitest";
import {
  bounds,
  buildDualGridLayer,
  countDualGridCases,
  createDualGrid,
  createDualGridChunk,
  dualGridMask,
  dualGridValue,
} from "../src/geometry/index.js";

describe("dual grid terrain", () => {
  it("encodes four source samples as a 16-case mask", () => {
    const grid = createDualGrid([
      ["grass", "dirt"],
      ["dirt", "grass"],
    ]);
    expect(dualGridMask(grid, "grass", 0, 0)).toBe(5);
    expect(dualGridMask(grid, "dirt", 0, 0)).toBe(10);
  });

  it("builds deterministic rounded top and skirt geometry", () => {
    const grid = createDualGrid([
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ], { originX: -1, originZ: -1 });
    const options = { tileSize: 2, topY: 0.3, skirtBottomY: 0, subdivisions: 6 };
    const first = buildDualGridLayer(grid, 1, options);
    const second = buildDualGridLayer(grid, 1, options);
    expect(first).toEqual(second);
    expect(first.positions.length).toBeGreaterThan(20);
    expect(first.indices.length % 3).toBe(0);
    expect(first.positions.every((position) => Number.isFinite(position.x + position.y + position.z))).toBe(true);
    expect(first.positions.some((position) => position.y === 0)).toBe(true);
    expect(first.positions.some((position) => position.y === 0.3)).toBe(true);
  });

  it("keeps chunk sampling in shared global coordinates", () => {
    const sample = (x: number, z: number) => ((x + z) % 3 === 0 ? "path" : "grass");
    const left = createDualGridChunk(0, 0, 4, 3, sample);
    const right = createDualGridChunk(1, 0, 4, 3, sample);
    expect(left.originX).toBe(0);
    expect(right.originX).toBe(4);
    for (let z = 0; z < left.depth; z++) {
      expect(dualGridValue(left, left.width - 1, z)).toBe(dualGridValue(right, 0, z));
    }
    const leftMesh = buildDualGridLayer(left, "grass", { tileSize: 1.5 });
    const rightMesh = buildDualGridLayer(right, "grass", { tileSize: 1.5 });
    expect(bounds(leftMesh).max.x).toBeCloseTo(bounds(rightMesh).min.x);
  });

  it("counts every rendered dual cell", () => {
    const grid = createDualGrid([
      [true, false, true, false],
      [true, true, false, false],
      [false, true, true, false],
    ]);
    const stats = countDualGridCases(grid, true);
    expect(stats.counts.reduce((sum, count) => sum + count, 0)).toBe(6);
    expect(stats.transitionCells).toBeGreaterThan(0);
  });
});
