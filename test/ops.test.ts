import { describe, it, expect } from "vitest";
import {
  box,
  plane,
  sphere,
  subdivide,
  displaceByNoise,
  array,
  scatterOnSurface,
  selectByAttr,
  extrude,
  triangleCount,
  vertexCount,
  bounds,
  length,
  vec3,
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
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 4);
}

describe("subdivide", () => {
  it("quadruples triangle count per iteration", () => {
    const m = box(1, 1, 1);
    const s1 = subdivide(m, 1);
    expect(triangleCount(s1)).toBe(triangleCount(m) * 4);
    const s2 = subdivide(m, 2);
    expect(triangleCount(s2)).toBe(triangleCount(m) * 16);
    assertValid(s1);
  });
  it("preserves the bounding box (no smoothing)", () => {
    const b0 = bounds(box(2, 2, 2));
    const b1 = bounds(subdivide(box(2, 2, 2), 2));
    expect(b1.max.x).toBeCloseTo(b0.max.x, 5);
    expect(b1.min.y).toBeCloseTo(b0.min.y, 5);
  });
});

describe("displaceByNoise", () => {
  it("is deterministic and moves vertices", () => {
    const base = subdivide(sphere(1, 16, 12), 1);
    const a = displaceByNoise(base, { amount: 0.3, scale: 2, seed: 5 });
    const b = displaceByNoise(base, { amount: 0.3, scale: 2, seed: 5 });
    expect(a.positions[10]).toEqual(b.positions[10]);
    // some vertex moved off the unit sphere
    let moved = false;
    for (const p of a.positions) if (Math.abs(length(p) - 1) > 0.01) moved = true;
    expect(moved).toBe(true);
    assertValid(a);
  });
});

describe("array", () => {
  it("creates count copies and spans the right distance", () => {
    const m = box(1, 1, 1);
    const a = array(m, { count: 5, axis: "x", step: 2 });
    expect(triangleCount(a)).toBe(triangleCount(m) * 5);
    const b = bounds(a);
    // copies at x=0..8, each box half-width 0.5 => min -0.5, max 8.5
    expect(b.min.x).toBeCloseTo(-0.5, 5);
    expect(b.max.x).toBeCloseTo(8.5, 5);
  });
});

describe("scatterOnSurface", () => {
  it("places count instances, deterministically", () => {
    const ground = plane(4, 4, 2, 2);
    const inst = box(0.2, 0.2, 0.2);
    const a = scatterOnSurface(ground, inst, { count: 20, seed: 3 });
    const b = scatterOnSurface(ground, inst, { count: 20, seed: 3 });
    expect(triangleCount(a)).toBe(triangleCount(inst) * 20);
    expect(a.positions[0]).toEqual(b.positions[0]);
    assertValid(a);
  });
  it("scattered instances land within the surface bounds (xz)", () => {
    const ground = plane(4, 4, 1, 1);
    const inst = box(0.1, 0.1, 0.1);
    const a = scatterOnSurface(ground, inst, { count: 30, seed: 1, alignToNormal: false });
    const bb = bounds(a);
    expect(bb.min.x).toBeGreaterThanOrEqual(-2.2);
    expect(bb.max.x).toBeLessThanOrEqual(2.2);
  });
});

describe("selectByAttr", () => {
  it("selects only the top face of a box by normal", () => {
    const m = box(2, 2, 2);
    const top = selectByAttr(m, { normalAxis: vec3(0, 1, 0), normalThreshold: 0.9 });
    expect(triangleCount(top)).toBe(2); // one face = 2 tris
    const b = bounds(top);
    expect(b.min.y).toBeCloseTo(1, 5);
    expect(b.max.y).toBeCloseTo(1, 5);
  });
  it("selects a height band", () => {
    const m = box(2, 2, 2);
    const upper = selectByAttr(m, { heightAxis: vec3(0, 1, 0), heightMin: 0.5 });
    expect(triangleCount(upper)).toBeGreaterThan(0);
    expect(bounds(upper).max.y).toBeCloseTo(1, 5);
  });
});

describe("extrude", () => {
  it("produces a closed shell with more triangles", () => {
    const m = plane(1, 1, 1, 1);
    const e = extrude(m, 0.5);
    // each input tri -> 1 top + 3 side quads (6 tris) = 7 tris
    expect(triangleCount(e)).toBe(triangleCount(m) * 7);
    assertValid(e);
  });
  it("moves the extruded faces outward along +Y for a flat plane", () => {
    const m = plane(2, 2, 1, 1);
    const e = extrude(m, 0.5);
    expect(bounds(e).max.y).toBeCloseTo(0.5, 5);
  });
});

