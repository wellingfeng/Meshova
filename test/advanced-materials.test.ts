import { describe, expect, it } from "vitest";
import {
  ADVANCED_MATERIAL_DEFINITIONS,
  ADVANCED_MATERIAL_PARAM_SCHEMA,
  ADVANCED_MATERIALS,
  defaultAdvancedMaterialParams,
  validateMaterial,
} from "../src/index.js";

describe("advanced material second batch", () => {
  const names = Object.keys(ADVANCED_MATERIALS) as Array<keyof typeof ADVANCED_MATERIALS>;

  it("registers every proposed material as an independent preset", () => {
    expect(names).toEqual([
      "damagedPaintedMetal",
      "forestGround",
      "treeBarkRings",
      "wovenFabric",
      "layeredCliff",
      "floodFillBrickWall",
      "layeredRoofTiles",
      "agedLeather",
      "ornamentalPattern",
    ]);
    expect(Object.keys(ADVANCED_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(ADVANCED_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultAdvancedMaterialParams(name);
      const second = defaultAdvancedMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid PBR maps with structural relief", () => {
    for (const name of names) {
      const first = ADVANCED_MATERIALS[name](24, {});
      const second = ADVANCED_MATERIALS[name](24, {});
      expect(validateMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.02);
    }
  });

  it("keeps painted coating dielectric and exposed substrate metallic", () => {
    const material = ADVANCED_MATERIALS.damagedPaintedMetal(48, { wear: 0.9 });
    expect(Math.min(...material.metallic.data)).toBe(0);
    expect(Math.max(...material.metallic.data)).toBeGreaterThan(0.1);
  });

  it("scale changes structural output", () => {
    const coarse = ADVANCED_MATERIALS.floodFillBrickWall(24, { scale: 4 });
    const dense = ADVANCED_MATERIALS.floodFillBrickWall(24, { scale: 12 });
    expect([...coarse.height.data]).not.toEqual([...dense.height.data]);
  });
});
