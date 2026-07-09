import { describe, it, expect } from "vitest";
import { spmFeatureToParams, type SpmTreeFeature } from "../src/vegetation/spm-fit.js";

function feature(over: Partial<SpmTreeFeature> = {}): SpmTreeFeature {
  return {
    trunkLength: 15,
    depth: 3,
    hasLeaf: true,
    hasFrond: false,
    leafInstances: 2000,
    frondInstances: 0,
    leafSize: 6,
    leafAspect: 1,
    levels: [
      { level: 1, name: "Trunk", instances: 1, childrenPerParent: 1, lengthRatio: 1 },
      { level: 2, name: "Level 1", instances: 9, childrenPerParent: 9, lengthRatio: 1.2, startAngle: 0.5 },
      { level: 3, name: "Twigs", instances: 60, childrenPerParent: 6.7, lengthRatio: 0.5 },
    ],
    ...over,
  };
}

describe("spmFeatureToParams", () => {
  it("maps first-order branch count to a branchCount multiplier", () => {
    const many = spmFeatureToParams(feature({
      levels: [
        { level: 1, name: "Trunk", instances: 1, childrenPerParent: 1, lengthRatio: 1 },
        { level: 2, name: "Level 1", instances: 30, childrenPerParent: 30, lengthRatio: 1 },
      ],
    }));
    const few = spmFeatureToParams(feature({
      levels: [
        { level: 1, name: "Trunk", instances: 1, childrenPerParent: 1, lengthRatio: 1 },
        { level: 2, name: "Level 1", instances: 3, childrenPerParent: 3, lengthRatio: 1 },
      ],
    }));
    expect(many.params.branchCount).toBeGreaterThan(few.params.branchCount!);
  });

  it("derives higher leafDensity for denser leaf instance counts", () => {
    const dense = spmFeatureToParams(feature({ leafInstances: 8000 }));
    const sparse = spmFeatureToParams(feature({ leafInstances: 200 }));
    expect(dense.params.leafDensity!).toBeGreaterThan(sparse.params.leafDensity!);
  });

  it("keeps all mapped params within the library's valid ranges", () => {
    const p = spmFeatureToParams(feature()).params;
    if (p.branchCount !== undefined) expect(p.branchCount).toBeGreaterThanOrEqual(0.1);
    if (p.crownScale !== undefined) { expect(p.crownScale).toBeGreaterThanOrEqual(0.2); expect(p.crownScale).toBeLessThanOrEqual(3); }
    if (p.leafDensity !== undefined) { expect(p.leafDensity).toBeGreaterThanOrEqual(0); expect(p.leafDensity).toBeLessThanOrEqual(3); }
    if (p.leafSize !== undefined) { expect(p.leafSize).toBeGreaterThanOrEqual(0.2); expect(p.leafSize).toBeLessThanOrEqual(3); }
    if (p.branchAngle !== undefined) { expect(p.branchAngle).toBeGreaterThanOrEqual(-45); expect(p.branchAngle).toBeLessThanOrEqual(45); }
  });

  it("produces human-readable notes for the report", () => {
    const { notes } = spmFeatureToParams(feature());
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(" ")).toMatch(/分支|叶|枝/);
  });
});
