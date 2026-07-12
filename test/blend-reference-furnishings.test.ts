import { describe, expect, it } from "vitest";
import {
  BLEND_REFERENCE_FURNISHINGS,
  bounds,
  buildBlendReferenceFurnishingParts,
  merge,
  triangleCount,
  type Mesh,
} from "../src/index.js";

function connectedComponents(mesh: Mesh): number {
  const parent = mesh.positions.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== index) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index]!;
    const b = mesh.indices[index + 1]!;
    const c = mesh.indices[index + 2]!;
    unite(a, b);
    unite(b, c);
  }
  return new Set(mesh.indices.map((index) => find(index))).size;
}

describe("Blender reference furnishing archetypes", () => {
  it("builds every learned category with semantic labels", () => {
    expect(BLEND_REFERENCE_FURNISHINGS).toHaveLength(16);
    for (const definition of BLEND_REFERENCE_FURNISHINGS) {
      const parts = buildBlendReferenceFurnishingParts({ kind: definition.defaults.kind });
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
      expect(triangleCount(merge(...parts.map((part) => part.mesh)))).toBeGreaterThan(20);
    }
  });

  it("keeps upholstered gaps backed by a continuous substrate", () => {
    const sofa = buildBlendReferenceFurnishingParts({ kind: "modern-sofa", modules: 5 });
    const ottoman = buildBlendReferenceFurnishingParts({ kind: "ottoman", modules: 5 });
    expect(sofa.some((part) => part.name === "continuous_upholstered_deck")).toBe(true);
    expect(ottoman.some((part) => part.name === "sealed_ottoman_body")).toBe(true);
  });

  it("stitches sofa seat modules into one closed shell", () => {
    const sofa = buildBlendReferenceFurnishingParts({ kind: "modern-sofa", modules: 5 });
    const seats = sofa.find((part) => part.name === "seat_cushions");
    expect(seats?.label).toBe("连续压缝模块座垫");
    expect(connectedComponents(seats!.mesh)).toBe(1);
  });

  it("responds to dimensions and stays deterministic", () => {
    const a = buildBlendReferenceFurnishingParts({ kind: "cabinet", width: 1.8, modules: 3 });
    const b = buildBlendReferenceFurnishingParts({ kind: "cabinet", width: 1.8, modules: 3 });
    const wide = buildBlendReferenceFurnishingParts({ kind: "cabinet", width: 3.2, modules: 6 });
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));
    expect(bounds(merge(...wide.map((part) => part.mesh))).max.x).toBeGreaterThan(bounds(merge(...a.map((part) => part.mesh))).max.x);
  });

  it("uses detail as indoor-plant LOD", () => {
    const low = buildBlendReferenceFurnishingParts({ kind: "indoor-plant", detail: 0.5, modules: 8 });
    const high = buildBlendReferenceFurnishingParts({ kind: "indoor-plant", detail: 1.5, modules: 8 });
    expect(triangleCount(merge(...high.map((part) => part.mesh)))).toBeGreaterThan(triangleCount(merge(...low.map((part) => part.mesh))));
  });

  it("matches measured appliance envelopes", () => {
    for (const kind of ["desktop-monitor", "wall-air-conditioner", "keyboard"] as const) {
      const definition = BLEND_REFERENCE_FURNISHINGS.find((entry) => entry.defaults.kind === kind)!;
      const modelBounds = bounds(merge(...buildBlendReferenceFurnishingParts({ kind }).map((part) => part.mesh)));
      const width = modelBounds.max.x - modelBounds.min.x;
      const height = modelBounds.max.y - modelBounds.min.y;
      expect(width).toBeCloseTo(definition.defaults.width, 2);
      expect(height).toBeLessThanOrEqual(definition.defaults.height * 1.08);
      expect(height).toBeGreaterThan(definition.defaults.height * 0.78);
    }
  });

  it("matches richer procedural surfaces to furnishing semantics", () => {
    const ottoman = buildBlendReferenceFurnishingParts({ kind: "ottoman" });
    const table = buildBlendReferenceFurnishingParts({ kind: "dining-table" });
    const refrigerator = buildBlendReferenceFurnishingParts({ kind: "refrigerator" });
    expect(ottoman.every((part) => part.surface?.type === "fabric")).toBe(true);
    expect(table.find((part) => part.name === "table_top")?.surface?.type).toBe("marble");
    expect(refrigerator.find((part) => part.name === "refrigerator_shell")?.surface?.type).toBe("glossPaint");
    expect(refrigerator.find((part) => part.name === "refrigerator_handles")?.surface?.type).toBe("brushedMetal");
  });
});
