import { describe, it, expect } from "vitest";
import {
  box,
  cylinder,
  catmullClark,
  bounds,
  triangleCount,
  length,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("catmullClark", () => {
  it("welds + subdivides a cube into quads (x6 per step)", () => {
    const c = box(2, 2, 2);
    expect(triangleCount(catmullClark(c, 1))).toBe(72); // 6 quads*... 12 tri faces -> 72
    expect(triangleCount(catmullClark(c, 2))).toBe(288);
    assertValid(catmullClark(c, 2));
  });

  it("shrinks the cube toward its smooth limit surface", () => {
    const before = bounds(box(2, 2, 2)).max.x;
    const after = bounds(catmullClark(box(2, 2, 2), 2)).max.x;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0.7); // rounds but doesn't collapse
  });

  it("keeps a cylinder watertight after smoothing", () => {
    const m = catmullClark(cylinder(0.5, 1.5, 12, true), 2);
    assertValid(m);
    // smoothed cylinder still roughly its radius/height
    const b = bounds(m);
    expect(b.max.y).toBeLessThanOrEqual(0.76);
    expect(b.max.x).toBeLessThan(0.55);
  });

  it("is deterministic", () => {
    const a = catmullClark(box(1, 1, 1), 2);
    const b = catmullClark(box(1, 1, 1), 2);
    expect(a.positions.length).toBe(b.positions.length);
    expect(a.positions[20]).toEqual(b.positions[20]);
  });
});
