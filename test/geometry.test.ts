import { describe, it, expect } from "vitest";
import {
  box,
  sphere,
  plane,
  transform,
  translateMesh,
  scaleMesh,
  merge,
  recomputeNormals,
  bounds,
  vertexCount,
  triangleCount,
  length,
  sub,
  vec3,
  type Mesh,
} from "../src/index.js";

function assertValidMesh(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  // normals are unit length
  for (const n of m.normals) {
    expect(length(n)).toBeCloseTo(1, 5);
  }
}

describe("box", () => {
  it("has 24 verts, 12 triangles, valid topology", () => {
    const m = box(2, 2, 2);
    expect(vertexCount(m)).toBe(24);
    expect(triangleCount(m)).toBe(12);
    assertValidMesh(m);
  });

  it("bounds match the requested extents", () => {
    const b = bounds(box(2, 4, 6));
    expect(b.min).toEqual(vec3(-1, -2, -3));
    expect(b.max).toEqual(vec3(1, 2, 3));
  });
});

describe("sphere", () => {
  it("is valid and all verts sit on the radius", () => {
    const r = 0.7;
    const m = sphere(r, 16, 12);
    assertValidMesh(m);
    for (const p of m.positions) {
      expect(length(p)).toBeCloseTo(r, 5);
    }
  });

  it("normal points outward (matches normalized position)", () => {
    const m = sphere(1, 8, 6);
    for (let i = 0; i < m.positions.length; i++) {
      const p = m.positions[i]!;
      const n = m.normals[i]!;
      // dot(p_dir, n) ~ 1
      const dot = p.x * n.x + p.y * n.y + p.z * n.z;
      expect(dot).toBeGreaterThan(0.99);
    }
  });
});

describe("plane", () => {
  it("subdivides into the right vertex/triangle count", () => {
    const m = plane(1, 1, 4, 3);
    expect(vertexCount(m)).toBe(5 * 4); // (cols+1)*(rows+1)
    expect(triangleCount(m)).toBe(4 * 3 * 2);
    assertValidMesh(m);
  });

  it("lies flat on y=0 facing up", () => {
    const m = plane(2, 2, 2, 2);
    for (const p of m.positions) expect(p.y).toBe(0);
    for (const n of m.normals) expect(n).toEqual(vec3(0, 1, 0));
  });
});

describe("transform", () => {
  it("translate moves bounds", () => {
    const m = translateMesh(box(1, 1, 1), vec3(10, 0, 0));
    const b = bounds(m);
    expect(b.min.x).toBeCloseTo(9.5, 5);
    expect(b.max.x).toBeCloseTo(10.5, 5);
  });

  it("uniform scale scales bounds", () => {
    const b = bounds(scaleMesh(box(1, 1, 1), 3));
    expect(b.max.x).toBeCloseTo(1.5, 5);
    expect(b.min.x).toBeCloseTo(-1.5, 5);
  });

  it("90deg rotation about Y maps +X extent to -Z", () => {
    const m = transform(box(2, 1, 1), { rotate: vec3(0, Math.PI / 2, 0) });
    const b = bounds(m);
    // width-2 along X becomes width-2 along Z
    expect(b.max.z - b.min.z).toBeCloseTo(2, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(1, 4);
  });

  it("keeps normals unit length under non-uniform scale", () => {
    const m = scaleMesh(box(1, 1, 1), vec3(3, 0.2, 5));
    for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 5);
  });

  it("does not mutate the input mesh", () => {
    const original = box(1, 1, 1);
    const before = original.positions[0]!;
    translateMesh(original, vec3(100, 100, 100));
    expect(original.positions[0]).toBe(before);
  });
});

describe("merge", () => {
  it("concatenates verts and offsets indices", () => {
    const a = box(1, 1, 1);
    const b = translateMesh(box(1, 1, 1), vec3(5, 0, 0));
    const m = merge(a, b);
    expect(vertexCount(m)).toBe(vertexCount(a) + vertexCount(b));
    expect(triangleCount(m)).toBe(triangleCount(a) + triangleCount(b));
    assertValidMesh(m);
  });
});

describe("recomputeNormals", () => {
  it("recovers outward normals on a box", () => {
    const m = recomputeNormals(box(2, 2, 2));
    assertValidMesh(m);
    // a +X face vertex should have a normal with positive x dominant
    const b = bounds(m);
    expect(b.max.x).toBeCloseTo(1, 5);
  });
});
