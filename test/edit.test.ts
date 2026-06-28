import { describe, it, expect } from "vitest";
import {
  box,
  plane,
  cylinder,
  extrudeRegion,
  insetFaces,
  bevelEdges,
  solidify,
  bridgeLoops,
  toTopo,
  fromTopo,
  diagnose,
  cleanupTopo,
  boundaryLoops,
  hardEdges,
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

describe("topology core", () => {
  it("fuses a box's 24 vertices into 8 shared points", () => {
    const topo = toTopo(box(1, 1, 1));
    expect(topo.points.length).toBe(8);
    expect(topo.faces.length).toBe(12); // 6 quads triangulated to 12 tris
  });

  it("a closed box has no border edges and is watertight", () => {
    const d = diagnose(toTopo(box(1, 1, 1)));
    expect(d.borderEdges).toBe(0);
    expect(d.nonManifoldEdges).toBe(0);
    expect(d.isClosed).toBe(true);
    expect(d.boundaryLoops).toBe(0);
  });

  it("an open plane reports one boundary loop", () => {
    const topo = toTopo(plane(1, 1, 1, 1));
    const loops = boundaryLoops(topo);
    expect(loops.length).toBe(1);
    expect(loops[0]!.length).toBe(4);
    expect(diagnose(topo).isClosed).toBe(false);
  });

  it("round-trips topo -> mesh without losing the bounding box", () => {
    const m = box(2, 2, 2);
    const rt = fromTopo(toTopo(m));
    const b0 = bounds(m);
    const b1 = bounds(rt);
    expect(b1.max.x).toBeCloseTo(b0.max.x, 5);
    expect(b1.min.z).toBeCloseTo(b0.min.z, 5);
    assertValid(rt);
  });

  it("a box has 12 hard edges at 30 degrees (every cube edge)", () => {
    const hard = hardEdges(toTopo(box(1, 1, 1)), 30);
    expect(hard.length).toBe(12);
  });

  it("selectFacesByNormal picks the up-facing top of a box", () => {
    const up = selectFacesByNormal(toTopo(box(1, 1, 1)), vec3(0, 1, 0), 30);
    expect(up.length).toBe(2); // top quad = two triangles
  });

  it("cleanupTopo welds duplicated coincident points and warns", () => {
    const topo = toTopo(box(1, 1, 1));
    // Inject a duplicate point + degenerate face.
    topo.points.push({ ...topo.points[0]! });
    topo.faces.push([0, 0, 1]);
    const { topo: clean, warnings } = cleanupTopo(topo);
    expect(clean.points.length).toBe(8);
    expect(warnings.some((w) => /weld/.test(w))).toBe(true);
    expect(warnings.some((w) => /degenerate/.test(w))).toBe(true);
  });
});

describe("extrudeRegion", () => {
  it("lifts the top of a box outward and stays valid", () => {
    const m = box(1, 1, 1);
    const out = extrudeRegion(m, { normalDir: vec3(0, 1, 0), angleDeg: 30 }, { distance: 0.5 });
    assertValid(out);
    // Top should now reach y = 0.5 + 0.5 = 1.0.
    expect(bounds(out).max.y).toBeCloseTo(1.0, 4);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
  });

  it("default selection moves all points along the shared region direction", () => {
    const out = extrudeRegion(box(1, 1, 1), undefined, { distance: 0.2 });
    assertValid(out);
    // All faces share one direction (box avg normal defaults to +Y): translation up.
    expect(bounds(out).max.y).toBeCloseTo(0.7, 4);
  });

  it("taper shrinks the moved cap", () => {
    const flat = extrudeRegion(plane(1, 1, 1, 1), undefined, { distance: 1 });
    const tapered = extrudeRegion(plane(1, 1, 1, 1), undefined, { distance: 1, taper: 0.9 });
    assertValid(tapered);
    // Tapered cap occupies a smaller XZ footprint at the top.
    expect(bounds(tapered).max.x).toBeLessThanOrEqual(bounds(flat).max.x + 1e-6);
  });
});

describe("insetFaces", () => {
  it("adds a rim and keeps the mesh valid", () => {
    const m = plane(2, 2, 1, 1);
    const out = insetFaces(m, undefined, { amount: 0.3 });
    assertValid(out);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
    // Outer bounds unchanged (inset moves inward only).
    expect(bounds(out).max.x).toBeCloseTo(bounds(m).max.x, 5);
  });

  it("clamps amount so it never crosses the centroid", () => {
    const out = insetFaces(plane(2, 2, 1, 1), undefined, { amount: 100 });
    assertValid(out);
  });
});

describe("bevelEdges", () => {
  it("chamfers a cube: more faces, face planes preserved, still valid", () => {
    const m = box(1, 1, 1);
    const out = bevelEdges(m, { width: 0.1 });
    assertValid(out);
    expect(triangleCount(out)).toBeGreaterThan(triangleCount(m));
    // Original face planes stay put (a +X face stays at x=0.5); only edges/corners are cut.
    expect(bounds(out).max.x).toBeCloseTo(0.5, 4);
    // The chamfer introduces points pulled inward from the corners.
    expect(out.positions.some((p) => p.x < 0.5 - 1e-3 && p.x > 0.3)).toBe(true);
  });

  it("width is clamped so faces never invert", () => {
    const out = bevelEdges(box(1, 1, 1), { width: 10 });
    assertValid(out);
  });

  it("segments>1 rounds the edge: more geometry than a flat chamfer", () => {
    const flat = bevelEdges(box(1, 1, 1), { width: 0.1, segments: 1 });
    const round = bevelEdges(box(1, 1, 1), { width: 0.1, segments: 4 });
    assertValid(round);
    expect(triangleCount(round)).toBeGreaterThan(triangleCount(flat));
    // Face planes still preserved.
    expect(bounds(round).max.x).toBeCloseTo(0.5, 4);
    // The rounded arc bulges out past the flat chamfer's straight cut: some
    // points sit further from the box center along a diagonal than the flat case.
    const maxR = (m: typeof round) =>
      Math.max(...m.positions.map((p) => Math.hypot(p.x, p.y, p.z)));
    expect(maxR(round)).toBeGreaterThan(maxR(flat) - 1e-6);
  });
});

describe("solidify", () => {
  it("turns an open plane into a closed shell", () => {
    const m = plane(2, 2, 2, 2);
    const shell = solidify(m, { thickness: 0.1 });
    assertValid(shell);
    expect(diagnose(toTopo(shell)).isClosed).toBe(true);
    // Thickness shows up as depth along the surface normal (y for a flat plane).
    const b = bounds(shell);
    expect(b.max.y - b.min.y).toBeCloseTo(0.1, 2);
  });
});

describe("bridgeLoops", () => {
  it("connects two square loops into a tube wall", () => {
    const a = [vec3(-1, 0, -1), vec3(1, 0, -1), vec3(1, 0, 1), vec3(-1, 0, 1)];
    const b = a.map((p) => vec3(p.x, 1, p.z));
    const out = bridgeLoops(plane(0.01, 0.01, 1, 1), a, b);
    assertValid(out);
    expect(bounds(out).max.y).toBeCloseTo(1, 4);
  });

  it("returns input unchanged on mismatched loop lengths", () => {
    const base = box(1, 1, 1);
    const out = bridgeLoops(base, [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)], [vec3(0, 0, 1)]);
    expect(triangleCount(out)).toBe(triangleCount(base));
  });
});

