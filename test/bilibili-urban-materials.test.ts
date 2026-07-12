import { describe, expect, it } from "vitest";
import {
  URBAN_MATERIAL_DEFINITIONS,
  URBAN_MATERIAL_PARAM_SCHEMA,
  URBAN_MATERIALS,
  defaultUrbanMaterialParams,
  bakeUrbanMaterial,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

describe("bilibili urban material reproductions", () => {
  const names = Object.keys(URBAN_MATERIALS) as Array<keyof typeof URBAN_MATERIALS>;

  it("registers all five requested material systems", () => {
    expect(names).toEqual([
      "urbanGroundKit",
      "damagedPlasterBrick",
      "sciFiIndustrialPanel",
      "brushedMetalGrille",
      "wetDrainConcrete",
    ]);
    expect(Object.keys(URBAN_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(URBAN_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultUrbanMaterialParams(name);
      const second = defaultUrbanMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid PBR maps with channel variation", () => {
    for (const name of names) {
      const first = materialFromFields(24, URBAN_MATERIALS[name]({}));
      const second = materialFromFields(24, URBAN_MATERIALS[name]({}));
      expect(validateMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.1);
      expect(Math.max(...first.roughness.data) - Math.min(...first.roughness.data), name).toBeGreaterThan(0.04);
    }
  });

  it("exposes meaningful material-specific controls", () => {
    const dry = materialFromFields(24, URBAN_MATERIALS.wetDrainConcrete({ wetness: 0 }));
    const wet = materialFromFields(24, URBAN_MATERIALS.wetDrainConcrete({ wetness: 1 }));
    expect([...dry.roughness.data]).not.toEqual([...wet.roughness.data]);

    const intact = materialFromFields(24, URBAN_MATERIALS.damagedPlasterBrick({ wear: 0 }));
    const damaged = materialFromFields(24, URBAN_MATERIALS.damagedPlasterBrick({ wear: 1 }));
    expect([...intact.height.data]).not.toEqual([...damaged.height.data]);
  });

  it("runs all five through the high-quality processing chain", () => {
    for (const name of names) {
      const first = bakeUrbanMaterial(name, 24);
      const second = bakeUrbanMaterial(name, 24);
      expect(validateMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.min(...first.height.data), name).toBeCloseTo(0, 2);
      expect(Math.max(...first.height.data), name).toBeGreaterThan(0.8);
    }
  });
});
