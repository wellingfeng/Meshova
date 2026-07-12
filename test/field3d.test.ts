import { describe, it, expect } from "vitest";
import {
  field3DStats,
  field3DToScalarGrid,
  generateField3D,
  normalizeField3D,
  sampleField3D,
  sampleField3DUVW,
  vec3,
} from "../src/index.js";

describe("Field3D volume", () => {
  it("generates, samples and normalizes scalar volumes", () => {
    const field = generateField3D(2, 2, 2, (u, v, w) => u + v + w);
    expect(sampleField3D(field, 0, 0, 0)).toBeCloseTo(0.75, 6);
    expect(sampleField3DUVW(field, 1, 1, 1)).toBeCloseTo(2.25, 6);

    const stats = field3DStats(field);
    expect(stats.min).toBeCloseTo(0.75, 6);
    expect(stats.max).toBeCloseTo(2.25, 6);

    const normalized = normalizeField3D(field);
    expect(field3DStats(normalized).min).toBeCloseTo(0, 6);
    expect(field3DStats(normalized).max).toBeCloseTo(1, 6);
  });

  it("converts to marching-cubes scalar grid layout", () => {
    const field = generateField3D(3, 2, 4, (_u, _v, _w, x, y, z) => x + y * 10 + z * 100);
    const grid = field3DToScalarGrid(field, { origin: vec3(-1, -2, -3), cell: 0.25 });
    expect(grid.gx).toBe(3);
    expect(grid.gy).toBe(2);
    expect(grid.gz).toBe(4);
    expect(grid.origin).toEqual(vec3(-1, -2, -3));
    expect(grid.cell).toBe(0.25);
    expect(grid.values.length).toBe(24);
    expect(grid.values[0]).toBe(0);
    expect(grid.values[3]).toBe(10);
  });
});
