import { describe, expect, it } from "vitest";
import {
  SWEET_HOME_FURNISHING_MODELS,
  bounds,
  buildSweetHomeFurnishingParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("Sweet Home 3D furnishing procedural reconstructions", () => {
  it("keeps all screenshot references as separate model definitions", () => {
    expect(SWEET_HOME_FURNISHING_MODELS).toHaveLength(39);
    expect(new Set(SWEET_HOME_FURNISHING_MODELS.map((model) => model.id)).size).toBe(39);
    expect(new Set(SWEET_HOME_FURNISHING_MODELS.map((model) => model.kind)).size).toBe(39);
    expect(new Set(SWEET_HOME_FURNISHING_MODELS.map((model) => model.category)).size).toBe(8);
  });

  it.each(SWEET_HOME_FURNISHING_MODELS)("builds valid geometry for $name", (definition) => {
    const parts = buildSweetHomeFurnishingParts(definition.defaults);
    const mesh = merge(...parts.map((part) => part.mesh));
    const modelBounds = bounds(mesh);

    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceMeshUsed === false)).toBe(true);
    expect(mesh.positions.length).toBeGreaterThan(30);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length)).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(10);
    expect(modelBounds.max.x - modelBounds.min.x).toBeGreaterThan(0.1);
    expect(modelBounds.max.y - modelBounds.min.y).toBeGreaterThan(0.1);
    expect(modelBounds.max.z - modelBounds.min.z).toBeGreaterThan(0.03);
  });

  it("is deterministic and responds to dimensions", () => {
    const first = buildSweetHomeFurnishingParts({ kind: "wardrobe", count: 5 });
    const second = buildSweetHomeFurnishingParts({ kind: "wardrobe", count: 5 });
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));

    const narrow = merge(...buildSweetHomeFurnishingParts({ kind: "dining-table", width: 1 }).map((part) => part.mesh));
    const wide = merge(...buildSweetHomeFurnishingParts({ kind: "dining-table", width: 2.4 }).map((part) => part.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(narrow).max.x - bounds(narrow).min.x);
  });
});
