import { describe, it, expect } from "vitest";
import { growingTree, trimCurve } from "../src/vegetation/growth.js";
import { tree } from "../src/vegetation/plant.js";
import { polyline, curveLength } from "../src/geometry/curve.js";
import { vec3 } from "../src/math/vec3.js";

import type { Mesh } from "../src/geometry/mesh.js";

const bboxHeight = (mesh: Mesh): number => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of mesh.positions) {
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  return hi - lo;
};

describe("trimCurve", () => {
  const line = polyline([vec3(0, 0, 0), vec3(0, 10, 0)]);

  it("returns a zero-length stub at frac 0", () => {
    expect(curveLength(trimCurve(line, 0))).toBeCloseTo(0, 6);
  });

  it("returns half the length at frac 0.5", () => {
    expect(curveLength(trimCurve(line, 0.5))).toBeCloseTo(5, 4);
  });

  it("returns the full curve at frac >= 1", () => {
    expect(curveLength(trimCurve(line, 1))).toBeCloseTo(10, 6);
  });
});

describe("growingTree", () => {
  const base = { seed: 7, height: 5, trunkRadius: 0.3, branchCount: 6, depth: 2 };

  it("is deterministic: same seed + growth -> identical mesh", () => {
    const a = growingTree({ ...base, growth: 0.5 });
    const b = growingTree({ ...base, growth: 0.5 });
    expect(a.wood.positions).toEqual(b.wood.positions);
    expect(a.wood.indices).toEqual(b.wood.indices);
    expect(a.leaves.positions).toEqual(b.leaves.positions);
  });

  it("growth = 1 reproduces the finished tree wood", () => {
    const grown = growingTree({ ...base, growth: 1, leaves: false });
    const finished = tree({ ...base, leaves: false });
    expect(grown.wood.positions.length).toBe(finished.wood.positions.length);
    expect(grown.branches.length).toBe(finished.branches.length);
  });

  it("gets taller as growth increases", () => {
    const h0 = bboxHeight(growingTree({ ...base, growth: 0.1 }).wood);
    const h1 = bboxHeight(growingTree({ ...base, growth: 0.5 }).wood);
    const h2 = bboxHeight(growingTree({ ...base, growth: 1.0 }).wood);
    expect(h0).toBeLessThan(h1);
    expect(h1).toBeLessThanOrEqual(h2 + 1e-6);
  });

  it("adds branches over time", () => {
    const early = growingTree({ ...base, growth: 0.15 }).branches.length;
    const late = growingTree({ ...base, growth: 0.9 }).branches.length;
    expect(late).toBeGreaterThan(early);
  });

  it("holds leaves back until the later stages", () => {
    const sprout = growingTree({ ...base, growth: 0.2, leafStart: 0.55 });
    const mature = growingTree({ ...base, growth: 1.0, leafStart: 0.55 });
    expect(sprout.leaves.positions.length).toBe(0);
    expect(mature.leaves.positions.length).toBeGreaterThan(0);
  });

  it("produces a non-empty trunk even at tiny growth", () => {
    const s = growingTree({ ...base, growth: 0.02 });
    expect(s.wood.positions.length).toBeGreaterThan(0);
  });
});
