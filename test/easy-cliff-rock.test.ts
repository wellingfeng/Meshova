import { describe, expect, it } from "vitest";
import {
  bounds,
  buildEasyCliffRockParts,
  triangleCount,
} from "../src/index.js";

describe("easy cliff rock", () => {
  it("builds rock, brush, and foliage layers", () => {
    const parts = buildEasyCliffRockParts({
      count: 2,
      resolution: 20,
      foliageDensity: 0.5,
      seed: 7,
    });
    expect(parts.map((part) => part.name)).toEqual([
      "cliff_rock",
      "cliff_brush",
      "cliff_foliage",
    ]);
    for (const part of parts) expect(triangleCount(part.mesh)).toBeGreaterThan(0);
  });

  it("is deterministic for one seed", () => {
    const params = { count: 2, resolution: 20, foliageDensity: 0.25, seed: 23 };
    const a = buildEasyCliffRockParts(params);
    const b = buildEasyCliffRockParts(params);
    expect(b[0]!.mesh.positions).toEqual(a[0]!.mesh.positions);
    expect(b[2]!.mesh.positions).toEqual(a[2]!.mesh.positions);
  });

  it("supports a bare single pillar", () => {
    const parts = buildEasyCliffRockParts({
      count: 1,
      height: 9,
      resolution: 20,
      foliageDensity: 0,
    });
    expect(parts).toHaveLength(1);
    const rockBounds = bounds(parts[0]!.mesh);
    expect(rockBounds.min.y).toBeCloseTo(0, 5);
    expect(rockBounds.max.y - rockBounds.min.y).toBeGreaterThan(5);
  });
});
