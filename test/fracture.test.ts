import { describe, it, expect } from "vitest";
import { box } from "../src/geometry/primitives.js";
import { voronoiFracture, stackFragments } from "../src/geometry/fracture.js";
import { bounds } from "../src/geometry/mesh.js";

describe("voronoiFracture", () => {
  it("produces the requested number of non-empty fragments", () => {
    const frags = voronoiFracture(box(2, 2, 2), { cells: 6, seed: 3 });
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.length).toBeLessThanOrEqual(6);
    for (const f of frags) expect(f.mesh.indices.length).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    const a = voronoiFracture(box(2, 2, 2), { cells: 5, seed: 7 });
    const b = voronoiFracture(box(2, 2, 2), { cells: 5, seed: 7 });
    expect(a.length).toBe(b.length);
    expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
  });

  it("different seeds give different shards", () => {
    const a = voronoiFracture(box(2, 2, 2), { cells: 5, seed: 1 });
    const b = voronoiFracture(box(2, 2, 2), { cells: 5, seed: 2 });
    expect(a[0]!.site).not.toEqual(b[0]!.site);
  });

  it("fragments stay within the source bounds", () => {
    const src = box(2, 2, 2);
    const sb = bounds(src);
    const frags = voronoiFracture(src, { cells: 8, seed: 4 });
    for (const f of frags) {
      const fb = bounds(f.mesh);
      expect(fb.min.x).toBeGreaterThanOrEqual(sb.min.x - 1e-3);
      expect(fb.max.x).toBeLessThanOrEqual(sb.max.x + 1e-3);
      expect(fb.max.y).toBeLessThanOrEqual(sb.max.y + 1e-3);
    }
  });

  it("cells<1 or empty mesh returns no fragments", () => {
    expect(voronoiFracture(box(1, 1, 1), { cells: 0 })).toEqual([]);
  });
});

describe("stackFragments", () => {
  it("places every fragment, deterministic per seed", () => {
    const frags = voronoiFracture(box(2, 2, 2), { cells: 6, seed: 3 });
    const s1 = stackFragments(frags, { seed: 1 });
    const s2 = stackFragments(frags, { seed: 1 });
    expect(s1.length).toBe(frags.length);
    expect(s1[0]!.positions).toEqual(s2[0]!.positions);
  });
});
