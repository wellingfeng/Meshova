import { describe, expect, it } from "vitest";
import {
  BLEND_REFERENCE_INTERIORS,
  buildBlendReferenceInteriorParts,
} from "../src/models/blend-reference-interior-collection.js";
import { bounds, merge, triangleCount } from "../src/geometry/index.js";
import { meshMetrics } from "../src/critique/geometry-metrics.js";

describe("Blender reference interior collection", () => {
  it("builds every unimplemented reference family deterministically", () => {
    expect(BLEND_REFERENCE_INTERIORS).toHaveLength(14);
    for (const definition of BLEND_REFERENCE_INTERIORS) {
      const first = buildBlendReferenceInteriorParts({ kind: definition.defaults.kind });
      const second = buildBlendReferenceInteriorParts({ kind: definition.defaults.kind });
      expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
      expect(first.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
      expect(first.every((part) => part.metadata?.sourceMeshUsed === false)).toBe(true);
      expect(triangleCount(merge(...first.map((part) => part.mesh)))).toBeGreaterThan(20);
    }
  });

  it("uses modules for repeated structural elements", () => {
    for (const kind of ["curtain", "venetian-blind", "wine-cabinet", "book-row"] as const) {
      const sparse = buildBlendReferenceInteriorParts({ kind, modules: 6 });
      const dense = buildBlendReferenceInteriorParts({ kind, modules: 20 });
      expect(triangleCount(merge(...dense.map((part) => part.mesh))))
        .toBeGreaterThan(triangleCount(merge(...sparse.map((part) => part.mesh))));
    }
  });

  it("responds to dimensions while preserving semantic parts", () => {
    const narrow = buildBlendReferenceInteriorParts({ kind: "tv-wall", width: 2.8 });
    const wide = buildBlendReferenceInteriorParts({ kind: "tv-wall", width: 5.2 });
    const narrowBounds = bounds(merge(...narrow.map((part) => part.mesh)));
    const wideBounds = bounds(merge(...wide.map((part) => part.mesh)));
    expect(wideBounds.max.x - wideBounds.min.x).toBeGreaterThan(narrowBounds.max.x - narrowBounds.min.x);
    expect(wide.some((part) => part.name === "tv_side_shelves")).toBe(true);
  });

  it("builds bar bottles and glasses as closed glass shells", () => {
    const parts = buildBlendReferenceInteriorParts({ kind: "bar-accessories" });
    for (const name of ["bar_bottles", "bar_glasses"]) {
      const part = parts.find((entry) => entry.name === name)!;
      expect(meshMetrics(part.mesh).watertight).toBe(true);
      expect(part.doubleSided).toBe(false);
      expect(part.surface?.params?.thickness).toBeGreaterThan(0);
    }
  });

  it("matches richer procedural surfaces to interior semantics", () => {
    const chair = buildBlendReferenceInteriorParts({ kind: "massage-chair" });
    const table = buildBlendReferenceInteriorParts({ kind: "side-table" });
    const cabinet = buildBlendReferenceInteriorParts({ kind: "wine-cabinet" });
    expect(chair.find((part) => part.name === "massage_chair_seat")?.surface?.type).toBe("leather");
    expect(table.find((part) => part.name === "side_table_top")?.surface?.type).toBe("marble");
    expect(table.find((part) => part.name === "side_table_tripod")?.surface?.type).toBe("brushedMetal");
    expect(cabinet.find((part) => part.name === "wine_cabinet_carcass")?.surface?.type).toBe("lacqueredWood");
  });
});
