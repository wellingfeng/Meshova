import { describe, expect, it } from "vitest";
import {
  SWEET_HOME_STAIR_MODELS,
  bounds,
  buildSweetHomeStaircaseParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("Sweet Home 3D staircase procedural reconstructions", () => {
  it("keeps every reference as a separate model definition", () => {
    expect(SWEET_HOME_STAIR_MODELS).toHaveLength(6);
    expect(new Set(SWEET_HOME_STAIR_MODELS.map((model) => model.id)).size).toBe(6);
    expect(new Set(SWEET_HOME_STAIR_MODELS.map((model) => model.kind)).size).toBe(6);
  });

  it.each(SWEET_HOME_STAIR_MODELS)("builds valid geometry for $name", (definition) => {
    const parts = buildSweetHomeStaircaseParts(definition.defaults);
    const mesh = merge(...parts.map((part) => part.mesh));
    const modelBounds = bounds(mesh);

    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceMeshUsed === false)).toBe(true);
    expect(mesh.positions.length).toBeGreaterThan(50);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length)).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(20);
    expect(modelBounds.max.y - modelBounds.min.y).toBeGreaterThan(definition.defaults.rise * 0.9);
  });

  it("is deterministic and responds to dimensions", () => {
    const a = buildSweetHomeStaircaseParts({ kind: "half-landing", steps: 18 });
    const b = buildSweetHomeStaircaseParts({ kind: "half-landing", steps: 18 });
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));

    const narrow = merge(...buildSweetHomeStaircaseParts({ kind: "straight", width: 0.8 }).map((part) => part.mesh));
    const wide = merge(...buildSweetHomeStaircaseParts({ kind: "straight", width: 1.8 }).map((part) => part.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(narrow).max.x - bounds(narrow).min.x);
  });
});
