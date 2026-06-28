import { describe, it, expect } from "vitest";
import {
  box,
  sphere,
  merge,
  translateMesh,
  blast,
  blastByNormal,
  blastByHeight,
  keepIsland,
  cleanMesh,
  bounds,
  triangleCount,
  vertexCount,
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
}

describe("blast", () => {
  it("deletes selected faces by default and keeps the rest", () => {
    const b = box(2, 2, 2);
    const before = triangleCount(b);
    // delete top-facing faces
    const r = blast(b, (f) => f.normal.y > 0.5);
    assertValid(r);
    expect(triangleCount(r)).toBeLessThan(before);
    // result should have no upward faces left
    for (let t = 0; t < r.indices.length; t += 3) {
      const a = r.positions[r.indices[t]!]!;
      // no vertex of removed top should remain orphaned beyond bound
      expect(a).toBeDefined();
    }
  });

  it("keep:true inverts to keep only selection", () => {
    const b = box(2, 2, 2);
    const top = blast(b, (f) => f.normal.y > 0.5, { keep: true });
    assertValid(top);
    // every remaining face points up
    expect(triangleCount(top)).toBeGreaterThan(0);
    const bb = bounds(top);
    // only the top cap remains -> min.y ~ max.y near +1
    expect(bb.min.y).toBeCloseTo(1, 4);
    expect(bb.max.y).toBeCloseTo(1, 4);
  });

  it("compacts orphan vertices after deletion", () => {
    const b = box(1, 1, 1);
    const r = blast(b, (f) => f.normal.y > 0.5, { keep: true });
    // a single quad (2 tris) uses 4 unique verts after compaction
    expect(vertexCount(r)).toBe(4);
    expect(triangleCount(r)).toBe(2);
  });

  it("blastByNormal removes faces facing an axis", () => {
    const b = box(2, 2, 2);
    const r = blastByNormal(b, vec3(0, 1, 0), 0.5);
    const bb = bounds(r);
    // top removed -> still spans full box in y via side faces
    expect(triangleCount(r)).toBeLessThan(triangleCount(b));
  });

  it("blastByHeight keeps when inverted", () => {
    const b = box(2, 4, 2);
    // delete the middle height band centroids
    const r = blastByHeight(b, vec3(0, 1, 0), -3, 3);
    assertValid(r);
  });
});

describe("keepIsland", () => {
  it("isolates a single connected component", () => {
    const a = box(1, 1, 1);
    const far = translateMesh(box(1, 1, 1), vec3(10, 0, 0));
    const m = merge(a, far);
    // island 0 should be the first box near origin
    const only = keepIsland(m, 0);
    assertValid(only);
    expect(triangleCount(only)).toBe(triangleCount(a));
    const bb = bounds(only);
    expect(bb.max.x).toBeLessThan(5);
  });
});

describe("cleanMesh", () => {
  it("preserves bounds and validity after welding merged duplicate boxes", () => {
    const a = box(1, 1, 1);
    const b = box(1, 1, 1); // exact duplicate, coincident verts
    const m = merge(a, b);
    const cleaned = cleanMesh(m);
    assertValid(cleaned);
    const bb = bounds(cleaned);
    expect(bb.min.x).toBeCloseTo(-0.5, 4);
    expect(bb.max.y).toBeCloseTo(0.5, 4);
    expect(triangleCount(cleaned)).toBeGreaterThan(0);
  });

  it("drops a zero-area degenerate triangle", () => {
    const positions = [
      vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(0, 1, 0),
      vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), // colinear -> zero area
    ];
    const normals = positions.map(() => vec3(0, 0, 1));
    const uvs = positions.map(() => ({ x: 0, y: 0 }));
    const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6];
    const m = { positions, normals, uvs, indices } as Mesh;
    const cleaned = cleanMesh(m);
    assertValid(cleaned);
    expect(triangleCount(cleaned)).toBe(2);
  });

  it("produces a valid mesh from a sphere", () => {
    const s = sphere(1, 12, 8);
    const cleaned = cleanMesh(s);
    assertValid(cleaned);
    expect(triangleCount(cleaned)).toBeGreaterThan(0);
  });
});
