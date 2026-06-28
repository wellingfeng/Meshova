import { describe, it, expect } from "vitest";
import {
  box,
  sphere,
  cylinder,
  union,
  subtract,
  intersect,
  bounds,
  triangleCount,
  length,
  transform,
  vec3,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  expect(m.indices.length).toBeGreaterThan(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 2);
}

describe("union", () => {
  it("two far boxes keep both fully", () => {
    const u = union(box(1, 1, 1), transform(box(1, 1, 1), { translate: vec3(3, 0, 0) }));
    const b = bounds(u);
    expect(b.min.x).toBeCloseTo(-0.5, 5);
    expect(b.max.x).toBeCloseTo(3.5, 5);
    assertValid(u);
  });
  it("overlapping box + sphere spans the combined extent", () => {
    const u = union(box(2, 2, 2), transform(sphere(1.3, 24, 16), { translate: vec3(1, 1, 1) }));
    const b = bounds(u);
    expect(b.min.x).toBeCloseTo(-1, 1);
    expect(b.max.x).toBeGreaterThan(2.2);
    assertValid(u);
  });
});

describe("subtract", () => {
  it("carving stays within the original solid A", () => {
    const s = subtract(box(2, 2, 2), transform(sphere(1.3, 24, 16), { translate: vec3(1, 1, 1) }));
    const b = bounds(s);
    expect(b.min.x).toBeCloseTo(-1, 1);
    expect(b.max.x).toBeLessThanOrEqual(1.05);
    assertValid(s);
  });
  it("a hole through a box (cylinder) produces extra interior faces", () => {
    const plain = box(2, 2, 2);
    const drilled = subtract(plain, cylinder(0.5, 3, 24, true));
    expect(triangleCount(drilled)).toBeGreaterThan(triangleCount(plain));
    assertValid(drilled);
  });
});

describe("intersect", () => {
  it("keeps only the overlap region", () => {
    const m = intersect(box(2, 2, 2), transform(sphere(1.3, 24, 16), { translate: vec3(1, 1, 1) }));
    const b = bounds(m);
    expect(b.min.x).toBeGreaterThan(-0.5);
    expect(b.max.x).toBeLessThanOrEqual(1.05);
    assertValid(m);
  });
});

describe("robustness", () => {
  it("handles UV-sphere pole degenerate triangles without breaking", () => {
    const u = union(sphere(1, 20, 14), transform(box(0.4, 0.4, 0.4), { translate: vec3(5, 0, 0) }));
    expect(bounds(u).max.x).toBeCloseTo(5.2, 1);
    assertValid(u);
  });
});
