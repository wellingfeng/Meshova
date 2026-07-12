import { describe, it, expect } from "vitest";
import {
  cylinder,
  cone,
  frustum,
  torus,
  icosphere,
  circle,
  bounds,
  triangleCount,
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

describe("cylinder", () => {
  it("valid, bounded by radius/height", () => {
    const m = cylinder(0.5, 2, 24, true);
    assertValid(m);
    const b = bounds(m);
    expect(b.max.y).toBeCloseTo(1, 5);
    expect(b.min.y).toBeCloseTo(-1, 5);
    expect(b.max.x).toBeCloseTo(0.5, 2);
  });
  it("without caps has fewer triangles", () => {
    expect(triangleCount(cylinder(0.5, 1, 24, false))).toBeLessThan(
      triangleCount(cylinder(0.5, 1, 24, true)),
    );
  });
});

describe("cone", () => {
  it("valid, apex at +height/2", () => {
    const m = cone(0.5, 2, 24, true);
    assertValid(m);
    expect(bounds(m).max.y).toBeCloseTo(1, 5);
  });
});

describe("frustum", () => {
  it("keeps distinct bottom and top radii", () => {
    const m = frustum(0.5, 0.25, 2, 24, true);
    assertValid(m);
    const b = bounds(m);
    expect(b.min.y).toBeCloseTo(-1, 5);
    expect(b.max.y).toBeCloseTo(1, 5);
    expect(b.max.x).toBeCloseTo(0.5, 2);
    const topRadius = Math.max(...m.positions.filter((p) => Math.abs(p.y - b.max.y) < 1e-6).map((p) => Math.hypot(p.x, p.z)));
    expect(topRadius).toBeCloseTo(0.25, 5);
  });
});

describe("torus", () => {
  it("valid, outer radius = radius+tube", () => {
    const m = torus(0.5, 0.2, 32, 16);
    assertValid(m);
    const b = bounds(m);
    expect(b.max.x).toBeCloseTo(0.7, 2);
    expect(b.max.y).toBeCloseTo(0.2, 2);
  });
});

describe("icosphere", () => {
  it("all verts on the radius, uniform", () => {
    const r = 0.8;
    const m = icosphere(r, 2);
    assertValid(m);
    for (const p of m.positions) expect(length(p)).toBeCloseTo(r, 4);
  });
  it("subdivisions multiply faces by 4", () => {
    expect(triangleCount(icosphere(1, 0))).toBe(20);
    expect(triangleCount(icosphere(1, 1))).toBe(80);
    expect(triangleCount(icosphere(1, 2))).toBe(320);
  });
});

describe("circle", () => {
  it("flat disc on y=0 facing up", () => {
    const m = circle(0.5, 32);
    assertValid(m);
    for (const p of m.positions) expect(p.y).toBe(0);
    for (const n of m.normals) expect(n).toEqual(vec3(0, 1, 0));
    expect(triangleCount(m)).toBe(32);
  });
});
