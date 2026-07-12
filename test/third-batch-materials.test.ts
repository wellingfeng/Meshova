import { describe, expect, it } from "vitest";
import {
  THIRD_BATCH_MATERIAL_DEFINITIONS,
  THIRD_BATCH_MATERIAL_PARAM_SCHEMA,
  THIRD_BATCH_MATERIALS,
  defaultThirdBatchMaterialParams,
  exportExtendedPBR,
  validateExtendedMaterial,
} from "../src/index.js";

describe("third batch mechanism materials", () => {
  const names = Object.keys(THIRD_BATCH_MATERIALS) as Array<keyof typeof THIRD_BATCH_MATERIALS>;

  it("registers all ten proposed materials", () => {
    expect(names).toEqual([
      "meltingSnow",
      "wetMudPuddles",
      "fracturedGlacierIce",
      "machinedBrushedMetal",
      "continuousVeinMarble",
      "coolingLava",
      "wornAsphaltRoad",
      "spalledRebarConcrete",
      "vascularLeaf",
      "sciFiHardSurfacePanel",
    ]);
    expect(Object.keys(THIRD_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(THIRD_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultThirdBatchMaterialParams(name);
      const second = defaultThirdBatchMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid extended PBR maps", () => {
    for (const name of names) {
      const first = THIRD_BATCH_MATERIALS[name](24, {});
      const second = THIRD_BATCH_MATERIALS[name](24, {});
      expect(validateExtendedMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.015);
      expect(Object.keys(exportExtendedPBR(first, name).files), name).toHaveLength(11);
    }
  });

  it("uses extended channels for ice, metal, leaf and lava", () => {
    const ice = THIRD_BATCH_MATERIALS.fracturedGlacierIce(32, {});
    const metal = THIRD_BATCH_MATERIALS.machinedBrushedMetal(32, {});
    const leaf = THIRD_BATCH_MATERIALS.vascularLeaf(32, {});
    const lava = THIRD_BATCH_MATERIALS.coolingLava(32, {});
    expect(Math.max(...ice.transmission.data)).toBeGreaterThan(0.4);
    expect(Math.max(...metal.anisotropy.data)).toBeGreaterThan(0.7);
    expect(Math.max(...metal.anisotropyRotation.data) - Math.min(...metal.anisotropyRotation.data)).toBeGreaterThan(0.4);
    expect(Math.min(...leaf.opacity.data)).toBe(0);
    expect(Math.max(...leaf.opacity.data)).toBe(1);
    expect(Math.max(...lava.emission.data)).toBeGreaterThan(0.3);
  });

  it("changes structural output when mechanism intensity changes", () => {
    const frozen = THIRD_BATCH_MATERIALS.meltingSnow(24, { amount: 0 });
    const melted = THIRD_BATCH_MATERIALS.meltingSnow(24, { amount: 1 });
    const dry = THIRD_BATCH_MATERIALS.wetMudPuddles(24, { amount: 0 });
    const wet = THIRD_BATCH_MATERIALS.wetMudPuddles(24, { amount: 1 });
    expect([...frozen.height.data]).not.toEqual([...melted.height.data]);
    expect([...dry.roughness.data]).not.toEqual([...wet.roughness.data]);
  });
});
