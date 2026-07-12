import { describe, expect, it } from "vitest";
import {
  BLEND_REFERENCE_PLANTS,
  buildBlendReferencePlantParts,
} from "../src/models/blend-reference-plants.js";
import { bounds, merge, triangleCount } from "../src/geometry/index.js";

describe("Blender reference plant family", () => {
  it("builds three distinct deterministic plant structures", () => {
    expect(BLEND_REFERENCE_PLANTS).toHaveLength(3);
    for (const definition of BLEND_REFERENCE_PLANTS) {
      const first = buildBlendReferencePlantParts({ kind: definition.defaults.kind });
      const second = buildBlendReferencePlantParts({ kind: definition.defaults.kind });
      expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
      expect(first.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
      expect(triangleCount(merge(...first.map((part) => part.mesh)))).toBeGreaterThan(120);
    }
  });

  it("responds to density without changing measured envelope", () => {
    const sparse = buildBlendReferencePlantParts({ kind: "dracaena", density: 0.6 });
    const dense = buildBlendReferencePlantParts({ kind: "dracaena", density: 1.4 });
    expect(triangleCount(merge(...dense.map((part) => part.mesh)))).toBeGreaterThan(triangleCount(merge(...sparse.map((part) => part.mesh))));
    const sparseBounds = bounds(merge(...sparse.map((part) => part.mesh)));
    const denseBounds = bounds(merge(...dense.map((part) => part.mesh)));
    expect(denseBounds.max.y).toBeCloseTo(sparseBounds.max.y, 1);
  });
});
