import { describe, expect, it } from "vitest";
import { bounds, buildDualGridFarm } from "../src/index.js";

describe("dual grid farm scene", () => {
  it("builds semantic terrain and farm dressing deterministically", () => {
    const first = buildDualGridFarm({ cells: 14, edgeResolution: 3, treeCount: 4, seed: 77 });
    const second = buildDualGridFarm({ cells: 14, edgeResolution: 3, treeCount: 4, seed: 77 });
    expect(first.parts).toEqual(second.parts);
    expect(first.parts.map((part) => part.label)).toContain("双网格草地");
    expect(first.parts.map((part) => part.label)).toContain("双网格石路");
    expect(first.parts.map((part) => part.label)).toContain("农舍墙体");
    expect(first.summary.dualCells).toBe(196);
    expect(first.summary.grassTransitions).toBeGreaterThan(0);
    expect(first.summary.pavingTransitions).toBeGreaterThan(0);
    expect(first.summary.trees).toBe(4);
    const sceneBounds = first.parts.map((part) => bounds(part.mesh));
    expect(Math.max(...sceneBounds.map((item) => item.max.y))).toBeGreaterThan(3);
  });
});
