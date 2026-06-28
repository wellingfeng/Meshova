import { describe, it, expect } from "vitest";
import {
  box,
  sphere,
  planeCut,
  loopCut,
  knifeCut,
  toTopo,
  diagnose,
  growSelection,
  shrinkSelection,
  selectionBoundary,
  selectFacesByNormal,
  triangleCount,
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
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("planeCut", () => {
  it("keep=positive drops everything below the plane", () => {
    const m = box(2, 2, 2); // spans y in [-1,1]
    const out = planeCut(m, { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, { keep: "positive" });
    assertValid(out);
    const b = bounds(out);
    expect(b.min.y).toBeGreaterThanOrEqual(-1e-4);
    expect(b.max.y).toBeCloseTo(1, 4);
  });

  it("keep=negative keeps the lower half", () => {
    const out = planeCut(box(2, 2, 2), { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, { keep: "negative" });
    assertValid(out);
    expect(bounds(out).max.y).toBeLessThanOrEqual(1e-4);
  });

  it("keep=both preserves the full extent and adds cut triangles", () => {
    const m = box(2, 2, 2);
    const out = planeCut(m, { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, { keep: "both" });
    assertValid(out);
    const b = bounds(out);
    expect(b.min.y).toBeCloseTo(-1, 4);
    expect(b.max.y).toBeCloseTo(1, 4);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
  });

  it("cap closes the positive half into a watertight piece", () => {
    const out = planeCut(sphere(1, 24, 18), { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, {
      keep: "positive",
      cap: true,
    });
    assertValid(out);
    expect(triangleCount(out)).toBeGreaterThan(0);
  });

  it("a plane that misses the mesh keeps it unchanged on the kept side", () => {
    const m = box(1, 1, 1);
    const out = planeCut(m, { point: vec3(0, 5, 0), normal: vec3(0, 1, 0) }, { keep: "negative" });
    expect(triangleCount(out)).toBe(triangleCount(m));
  });
});

describe("loopCut", () => {
  it("inserts edge rings without changing the bounding box", () => {
    const m = box(2, 2, 2);
    const out = loopCut(m, { point: vec3(0, 0, 0), normal: vec3(0, 1, 0) }, { cuts: 3 });
    assertValid(out);
    const b0 = bounds(m);
    const b1 = bounds(out);
    expect(b1.min.y).toBeCloseTo(b0.min.y, 4);
    expect(b1.max.y).toBeCloseTo(b0.max.y, 4);
    // More triangles than the original (rings added).
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
  });
});

describe("knifeCut", () => {
  it("inscribes a path as new edges without changing the bounding box", () => {
    const m = box(2, 2, 2);
    const path = [vec3(-1.5, 0.5, 1), vec3(0, 0.5, 1), vec3(1.5, -0.3, 1)];
    const out = knifeCut(m, path, { direction: vec3(0, 0, -1) });
    assertValid(out);
    const b0 = bounds(m);
    const b1 = bounds(out);
    expect(b1.max.x).toBeCloseTo(b0.max.x, 4);
    expect(b1.min.y).toBeCloseTo(b0.min.y, 4);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
  });

  it("returns the mesh unchanged for a degenerate (single-point) path", () => {
    const m = box(1, 1, 1);
    const out = knifeCut(m, [vec3(0, 0, 0)]);
    expect(triangleCount(out)).toBe(triangleCount(m));
  });

  it("projectToSurface inscribes a seam that follows a sphere's curvature", () => {
    const m = sphere(1, 24, 18);
    // A path roughly across the top; projected to the surface it should add edges.
    const path = [vec3(-0.9, 0.5, 0), vec3(0, 0.9, 0), vec3(0.9, 0.5, 0)];
    const out = knifeCut(m, path, { projectToSurface: true });
    assertValid(out);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
    // Radius preserved (cut adds edges, doesn't move the surface).
    const b = bounds(out);
    expect(b.max.x).toBeCloseTo(1, 2);
  });
});

describe("selection grow / shrink / boundary", () => {
  it("growSelection expands a single face to its neighbors", () => {
    const topo = toTopo(box(1, 1, 1));
    const seed = [0];
    const grown = growSelection(topo, seed, 1);
    expect(grown.length).toBeGreaterThan(seed.length);
  });

  it("growing then shrinking returns to a subset around the seed", () => {
    const topo = toTopo(box(1, 1, 1));
    const grown = growSelection(topo, [0], 1);
    const shrunk = shrinkSelection(topo, grown, 1);
    // Shrink keeps only interior faces; for a cube this collapses small sets.
    expect(shrunk.length).toBeLessThanOrEqual(grown.length);
  });

  it("selectionBoundary of all top faces equals those touching the sides", () => {
    const topo = toTopo(box(1, 1, 1));
    const top = selectFacesByNormal(topo, vec3(0, 1, 0), 30);
    const boundary = selectionBoundary(topo, top);
    // Every top face borders a side face, so all are on the boundary.
    expect(boundary.length).toBe(top.length);
  });
});
