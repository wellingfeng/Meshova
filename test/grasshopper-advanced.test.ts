import { describe, expect, it } from "vitest";
import {
  GRASSHOPPER_ADVANCED_RECIPES,
  buildMeshReactionShellParts,
  buildOrigamiPavilionParts,
  buildSuperformulaTowerParts,
  recipeDefaults,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("advanced Grasshopper-inspired model library", () => {
  it("registers three parameterized recipes", () => {
    expect(GRASSHOPPER_ADVANCED_RECIPES.map((recipe) => recipe.id)).toEqual([
      "grasshopper-mesh-reaction-shell",
      "grasshopper-superformula-tower",
      "grasshopper-origami-pavilion",
    ]);
    for (const recipe of GRASSHOPPER_ADVANCED_RECIPES) {
      expect(recipe.build(recipeDefaults(recipe)).length).toBeGreaterThan(0);
    }
  });

  it("builds finite, nontrivial standalone models", () => {
    const groups = [
      buildMeshReactionShellParts({ subdivisions: 2, iterations: 16 }),
      buildSuperformulaTowerParts({ segments: 24 }),
      buildOrigamiPavilionParts({ resolution: 8, iterations: 10 }),
    ];
    for (const parts of groups) {
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.reduce((sum, part) => sum + vertexCount(part.mesh), 0)).toBeGreaterThan(100);
      expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(100);
      for (const part of parts) {
        expect(part.label).toBeTruthy();
        expect(part.mesh.positions.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
      }
    }
  });
});
